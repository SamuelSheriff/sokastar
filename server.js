/**
 * Sokastar — Instasend Webhook Server
 * ------------------------------------
 * Receives payment notifications from Instasend and stores them
 * so the dashboard can pull them in real time.
 *
 * Deploy on: Railway, Render, Fly.io, etc.
 * Webhook URL: https://YOUR_DOMAIN/webhook/instasend
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ────────────────────────────────────────────────────────────────────
const INSTASEND_WEBHOOK_SECRET = process.env.INSTASEND_WEBHOOK_SECRET || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-this-secret-key';
const DB_FILE = path.join(__dirname, 'transactions.json');

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadTransactions() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('DB read error:', e.message);
  }
  return [];
}

function saveTransactions(txns) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(txns, null, 2));
  } catch (e) {
    console.error('DB write error:', e.message);
  }
}

// Verify Instasend webhook signature
function verifySignature(rawBody, signature) {
  if (!INSTASEND_WEBHOOK_SECRET) return true; // Skip verification if secret not set
  const expected = crypto
    .createHmac('sha256', INSTASEND_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature || '', 'hex')
  );
}

// Map Instasend payload to your schema
function mapInstasendPayload(body) {
  const invoice = body.invoice || body;
  const customer = invoice.customer || {};
  const phone = (customer.phone_number || '').replace(/^\+254/, '0');
  const mpesa = (invoice.mpesa_reference || invoice.reference || '').toUpperCase();
  const amount = parseFloat(invoice.net_amount || invoice.amount || 0);
  const state = (invoice.state || '').toUpperCase();
  const rawDate = invoice.created_at ? new Date(invoice.created_at) : new Date();
  const date = rawDate.toISOString().split('T')[0];
  const time = rawDate.toTimeString().slice(0, 5);

  return { phone, mpesa, amount, state, date, time };
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('/webhook/instasend', express.raw({ type: 'application/json' }));
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

/** Instasend Webhook */
app.post('/webhook/instasend', (req, res) => {
  const rawBody = req.body; // Buffer from express.raw
  const bodyStr = rawBody.toString('utf8');
  const sig = req.headers['x-instasend-signature'] || '';

  // Verify signature
  if (!verifySignature(bodyStr, sig)) {
    console.warn('Webhook signature mismatch — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(bodyStr);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log('Instasend webhook received:', JSON.stringify(payload, null, 2));

  const { phone, mpesa, amount, state, date, time } = mapInstasendPayload(payload);

  // Only store successful payments
  if (state !== 'COMPLETE' && state !== 'COMPLETED') {
    console.log(`Ignored — state is "${state}"`);
    return res.status(200).json({ status: 'ignored', reason: `state=${state}` });
  }

  // Basic validation
  if (!phone || !mpesa || amount <= 0) {
    console.warn('Webhook payload missing required fields', { phone, mpesa, amount });
    return res.status(422).json({ error: 'Missing required fields' });
  }

  // Deduplication
  const txns = loadTransactions();
  if (txns.some(t => t.mpesa === mpesa)) {
    console.log(`Duplicate M-Pesa code ${mpesa} — skipped`);
    return res.status(200).json({ status: 'duplicate' });
  }

  // Infer package
  const pkgMap = [
    { min: 240, max: 260, name: 'Daily' },
    { min: 45, max: 55, name: 'Super MultiBet' },
    { min: 35, max: 45, name: 'MidWeek Jackpot' },
    { min: 75, max: 85, name: 'Mega Jackpot' },
    { min: 15, max: 25, name: 'Half Time Full Time' },
  ];

  const inferredPkg = (pkgMap.find(p => amount >= p.min && amount <= p.max) || {}).name || 'Unknown';

  const newTx = {
    id: Date.now(),
    phone,
    mpesa,
    amount,
    package: inferredPkg,
    date,
    time,
    notes: 'Auto — Instasend webhook',
    source: 'instasend',
  };

  txns.push(newTx);
  saveTransactions(txns);

  console.log(`✅ Transaction saved: ${mpesa} | ${phone} | KES ${amount}`);
  res.status(200).json({ status: 'ok', transaction: newTx });
});

/** Get transactions (for dashboard) */
app.get('/api/transactions', (req, res) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const txns = loadTransactions();
  res.json({ transactions: txns, count: txns.length });
});

/** Delete transaction */
app.delete('/api/transactions/:id', (req, res) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = parseInt(req.params.id, 10);
  let txns = loadTransactions();
  const before = txns.length;
  txns = txns.filter(t => t.id !== id);

  if (txns.length === before) {
    return res.status(404).json({ error: 'Not found' });
  }

  saveTransactions(txns);
  res.json({ status: 'deleted' });
});

/** Health check */
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Sokastar webhook server running on port ${PORT}`);
  console.log(`📡 POST /webhook/instasend  ← Instasend webhook URL`);
  console.log(`📡 GET  /api/transactions   ← Dashboard polling`);
  console.log(`🔑 ADMIN_API_KEY: ${ADMIN_API_KEY === 'change-this-secret-key' 
    ? '⚠️  USING DEFAULT — CHANGE IT!' 
    : '✅ configured'}\n`);
});
