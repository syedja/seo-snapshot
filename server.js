require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // We serve inline HTML
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Rate limiting — prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ─────────────────────────────────────────
// SERVE FRONTEND
// ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/api/checkout',  require('./routes/checkout'));
app.use('/api/webhook',   require('./routes/webhook'));
app.use('/api/analyze',   require('./routes/analyze'));
app.use('/api/admin',     require('./routes/admin'));

// Catch-all — serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SEO Snapshot running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Stripe: ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗ missing'}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✓' : '✗ missing'}`);
  console.log(`   Resend: ${process.env.RESEND_API_KEY ? '✓' : '✗ missing'}`);
  console.log(`   Claude: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ missing'}\n`);
});

module.exports = app;
