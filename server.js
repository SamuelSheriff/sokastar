require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

// 1. IN-MEMORY STORE (For demo purposes - consider a DB like Supabase/MongoDB later)
let transactions = [];

// 2. WEBHOOK ENDPOINT (From IntaSend)
app.post('/webhook/instasend', (req, res) => {
    // Optional: Verify IntaSend Secret here using req.headers['x-intasend-signature']
    
    const data = req.body;
    console.log("Payment Received:", data);

    // Push to our transactions list
    transactions.unshift({
        id: data.invoice_id,
        amount: data.amount,
        phone: data.customer_phone,
        status: data.state,
        date: new Date().toISOString()
    });

    res.status(200).send("Acknowledged");
});

// 3. SECURE DASHBOARD ENDPOINT
// This is what your dashboard.html will fetch
app.get('/api/transactions', (req, res) => {
    const clientKey = req.headers['x-admin-api-key'];

    if (clientKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }

    res.json(transactions);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sokastar Server live on port ${PORT}`));
