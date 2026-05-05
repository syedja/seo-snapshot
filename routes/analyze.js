const express = require('express');
const router = express.Router();
const { analyzeSite } = require('../services/analyzer');

/**
 * POST /api/analyze
 * Body: { url, sessionId }
 *
 * Called by the frontend AFTER Stripe payment succeeds
 * (on the /success page) to render the report live.
 *
 * The webhook handles email delivery independently.
 * This route just returns the JSON for the browser UI.
 */
router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  let cleanUrl;
  try {
    cleanUrl = new URL(url.startsWith('http') ? url : 'https://' + url).href;
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const report = await analyzeSite(cleanUrl);
    res.json({ success: true, report });
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

module.exports = router;
