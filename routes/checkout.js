const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createPendingLead } = require('../services/db');

/**
 * POST /api/checkout
 * Body: { url, email }
 * Creates a Stripe Checkout session and returns the redirect URL.
 */
router.post('/', async (req, res) => {
  try {
    const { url, email } = req.body;

    if (!url || !email) {
      return res.status(400).json({ error: 'url and email are required' });
    }

    // Validate URL
    let cleanUrl;
    try {
      cleanUrl = new URL(url.startsWith('http') ? url : 'https://' + url).href;
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const domain = new URL(cleanUrl).hostname.replace('www.', '');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: {
        url: cleanUrl,
        email,
        domain,
      },
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/?cancelled=true`,
    });

    // Save pending lead to DB (pre-payment)
    try {
      await createPendingLead({
        email,
        domain,
        url: cleanUrl,
        stripeSessionId: session.id,
      });
    } catch (dbErr) {
      // Non-fatal — log but don't block payment
      console.error('DB pending lead error:', dbErr.message);
    }

    res.json({ checkoutUrl: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;
