const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { analyzeSite } = require('../services/analyzer');
const { generatePDF } = require('../services/pdf');
const { sendReportEmail } = require('../services/email');
const { markLeadPaid, markReportSent } = require('../services/db');

/**
 * POST /api/webhook
 * Stripe sends events here after payment.
 * Must verify the Stripe signature — uses raw body.
 *
 * To test locally:
 *   stripe listen --forward-to localhost:3000/api/webhook
 */
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Acknowledge receipt immediately — process async
  res.json({ received: true });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { url, email, domain } = session.metadata || {};

    if (!url || !email) {
      console.error('Webhook: missing metadata on session', session.id);
      return;
    }

    console.log(`\n✓ Payment confirmed for ${email} → ${domain}`);
    console.log(`  Session: ${session.id}`);

    // Run the full pipeline async (don't await in webhook handler)
    processReport({ url, email, domain, stripeSessionId: session.id })
      .catch(err => console.error('Pipeline error:', err));
  }
});

/**
 * Full post-payment pipeline:
 * 1. Analyze the site (Claude + cheerio)
 * 2. Generate PDF
 * 3. Send email
 * 4. Update DB
 */
async function processReport({ url, email, domain, stripeSessionId }) {
  try {
    // 1. SEO Analysis
    console.log(`  → Analyzing ${url}...`);
    const report = await analyzeSite(url);
    console.log(`  ✓ Analysis complete. Score: ${report.score}/100`);

    // 2. Update DB with results
    const lead = await markLeadPaid({
      stripeSessionId,
      score: report.score,
      reportJson: report,
    });
    console.log(`  ✓ DB updated. Lead ID: ${lead.id}`);

    // 3. Generate PDF
    console.log(`  → Generating PDF...`);
    const pdfBuffer = await generatePDF(report, email);
    console.log(`  ✓ PDF generated (${Math.round(pdfBuffer.length / 1024)}KB)`);

    // 4. Send email
    console.log(`  → Sending email to ${email}...`);
    await sendReportEmail(email, domain, report.score, pdfBuffer);
    console.log(`  ✓ Email sent!`);

    // 5. Mark as sent
    await markReportSent(lead.id);
    console.log(`  ✓ Pipeline complete for ${domain}\n`);

  } catch (err) {
    console.error(`  ✗ Pipeline failed for ${domain}:`, err.message);
    // TODO: Add retry logic / dead letter queue here for production
    // Options: bull queue, Supabase function, or a cron job that retries failed=true rows
  }
}

module.exports = router;
