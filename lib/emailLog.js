/**
 * Email logging helper.
 *
 * Records every transactional email into the `email_log` table so the internal
 * dashboard can report on and resend them. Designed to be FAILURE-SAFE: logging
 * must never throw, so a logging problem can never break a real email send or
 * order-processing flow.
 */

const { getSupabaseClient } = require('./supabase.js');

/**
 * Insert an email_log row. Never throws.
 *
 * @param {Object} entry
 * @param {'workshop'|'retreat'|'gift_card'} entry.emailType
 * @param {string} entry.toEmail
 * @param {'purchaser'|'recipient'|null} [entry.recipientRole]
 * @param {string} [entry.subject]
 * @param {'sent'|'failed'|'resent'} [entry.status='sent']
 * @param {string} [entry.resendMessageId]
 * @param {string} [entry.webflowOrderId]
 * @param {string} [entry.productId]
 * @param {string} [entry.giftCardCodeId]
 * @param {number} [entry.amountCents]
 * @param {Object} [entry.payload] - snapshot needed to reconstruct/resend
 * @param {string} [entry.error]
 * @param {string} [entry.resentFrom] - original email_log id (for resends)
 * @param {string} [entry.triggeredBy] - dashboard user email (for resends)
 * @returns {Promise<Object|null>} the inserted row, or null on failure
 */
async function logEmail(entry) {
  try {
    const supabase = getSupabaseClient();

    const row = {
      email_type: entry.emailType,
      to_email: entry.toEmail,
      recipient_role: entry.recipientRole || null,
      subject: entry.subject || null,
      status: entry.status || 'sent',
      resend_message_id: entry.resendMessageId || null,
      webflow_order_id: entry.webflowOrderId || null,
      product_id: entry.productId || null,
      gift_card_code_id: entry.giftCardCodeId || null,
      amount_cents: typeof entry.amountCents === 'number' ? entry.amountCents : null,
      payload: entry.payload || {},
      error: entry.error || null,
      resent_from: entry.resentFrom || null,
      triggered_by: entry.triggeredBy || null,
      html: entry.html || null,
      last_event: entry.lastEvent || null
    };

    const { data, error } = await supabase
      .from('email_log')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.warn('⚠️ Failed to write email_log entry:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    // Never let logging break the caller.
    console.warn('⚠️ Unexpected error writing email_log entry:', error?.message);
    return null;
  }
}

/**
 * Extract the Resend message id from a Resend SDK v3 response.
 * Resend returns `{ data: { id }, error }`.
 */
function resendMessageId(result) {
  return result?.data?.id || result?.id || null;
}

module.exports = {
  logEmail,
  resendMessageId
};
