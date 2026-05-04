# Sokastar Webhook Server — Setup Guide
# =======================================

## 1. Install dependencies
```
npm install
```

## 2. Set environment variables
Copy this block to your hosting provider's environment settings:

```
PORT=3000
INSTASEND_WEBHOOK_SECRET=get_this_from_instasend_dashboard
ADMIN_API_KEY=make_up_a_strong_random_key_eg_sk_live_abc123xyz
```

## 3. Deploy (choose one)

### Railway (recommended — free tier available)
1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Add the 3 environment variables above
4. Copy the generated URL (e.g. https://sokastar-webhook.up.railway.app)

### Render
1. New Web Service → connect GitHub repo
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add environment variables

### Fly.io
```
flyctl launch
flyctl secrets set INSTASEND_WEBHOOK_SECRET=xxx ADMIN_API_KEY=yyy
flyctl deploy
```

## 4. Configure Instasend
1. Log in to app.instasend.io
2. Go to Settings → Webhooks
3. Add webhook URL: `https://YOUR_DOMAIN/webhook/instasend`
4. Copy the Webhook Secret shown — set it as INSTASEND_WEBHOOK_SECRET

## 5. Configure the Dashboard
1. Open dashboard.html in your browser
2. Log in, go to ⚡ Instasend in the sidebar
3. Enter your server URL and ADMIN_API_KEY
4. Set sync interval (default: 1 minute)
5. Copy the webhook URL shown and paste it into Instasend

## Package Amount Mapping
Webhook auto-detects the package from the payment amount:
| Package           | Expected Amount (KES) |
|-------------------|-----------------------|
| Daily             | 250 (±10)             |
| Super MultiBet    | 50 (±5)               |
| MidWeek Jackpot   | 40 (±5)               |
| Mega Jackpot      | 80 (±5)               |
| Half Time FT      | 20 (±5)               |

## Testing the Webhook Locally
Use ngrok to expose your local server:
```
ngrok http 3000
```
Then use the ngrok URL as your webhook URL in Instasend.

## Files
- server.js          — Express webhook server
- dashboard.html     — Updated admin dashboard with Instasend tab
- transactions.json  — Auto-created; stores all webhook transactions
- package.json       — Node dependencies
