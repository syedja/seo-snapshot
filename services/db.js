const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────
// LEAD OPERATIONS
// ─────────────────────────────────────────

/**
 * Create a pending lead before Stripe payment.
 * Returns the lead id so the webhook can find it.
 */
async function createPendingLead({ email, domain, url, stripeSessionId }) {
  const { data, error } = await supabase
    .from('leads')
    .insert({
      email,
      domain,
      url,
      stripe_session_id: stripeSessionId,
      report_sent: false,
      paid: false,
    })
    .select('id')
    .single();

  if (error) throw new Error('DB insert failed: ' + error.message);
  return data.id;
}

/**
 * Mark a lead as paid and store analysis results.
 */
async function markLeadPaid({ stripeSessionId, score, reportJson }) {
  const { data, error } = await supabase
    .from('leads')
    .update({
      paid: true,
      score,
      report_json: reportJson,
      paid_at: new Date().toISOString(),
    })
    .eq('stripe_session_id', stripeSessionId)
    .select()
    .single();

  if (error) throw new Error('DB update failed: ' + error.message);
  return data;
}

/**
 * Mark report as emailed.
 */
async function markReportSent(leadId) {
  const { error } = await supabase
    .from('leads')
    .update({ report_sent: true, report_sent_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) throw new Error('DB update failed: ' + error.message);
}

/**
 * Get lead by Stripe session ID.
 */
async function getLeadBySession(stripeSessionId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('stripe_session_id', stripeSessionId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get all leads for admin dashboard.
 */
async function getAllLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('id, email, domain, url, score, paid, report_sent, created_at, paid_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error('DB fetch failed: ' + error.message);
  return data;
}

module.exports = {
  supabase,
  createPendingLead,
  markLeadPaid,
  markReportSent,
  getLeadBySession,
  getAllLeads,
};
