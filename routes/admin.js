const express = require('express');
const router = express.Router();
const { getAllLeads } = require('../services/db');

/**
 * Simple middleware: check X-Admin-Password header.
 * In production you'd use a proper session / JWT system.
 */
function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-password'];
  if (!provided || provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/admin/login
 * Body: { password }
 * Returns success if password matches.
 */
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

/**
 * GET /api/admin/leads
 * Returns all leads for the admin dashboard.
 * Protected by X-Admin-Password header.
 */
router.get('/leads', adminAuth, async (req, res) => {
  try {
    const leads = await getAllLeads();
    const totalRevenue = leads.filter(l => l.paid).length * 9;
    const avgScore = leads.filter(l => l.score).reduce((a, l, _, arr) => a + l.score / arr.length, 0);

    res.json({
      leads,
      stats: {
        total: leads.length,
        paid: leads.filter(l => l.paid).length,
        reportsSent: leads.filter(l => l.report_sent).length,
        revenue: totalRevenue,
        avgScore: Math.round(avgScore) || 0,
      },
    });
  } catch (err) {
    console.error('Admin leads error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

module.exports = router;
