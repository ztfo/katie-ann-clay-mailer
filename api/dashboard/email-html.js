/**
 * GET /api/dashboard/email-html?id=<email_log id>  (auth required)
 * Returns the rendered HTML of a logged email for in-dashboard preview.
 *
 * Resolution order:
 *   1. Stored html (permanent, preferred).
 *   2. Gift cards: re-render from the stored payload (no external calls).
 *   3. Live fetch from Resend by message id (needs RESEND_READ_API_KEY), cached back.
 */

const { getSupabaseClient } = require('../../lib/supabase.js');
const { requireAuth } = require('../../lib/auth.js');
const { createGiftCardEmailTemplate } = require('../../lib/resend.js');
const { amountDisplayFromCents } = require('../../lib/util.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAuth(req, res))) return;

  try {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    const supabase = getSupabaseClient();
    const { data: row, error } = await supabase
      .from('email_log')
      .select('id, html, resend_message_id, subject, to_email, email_type, amount_cents, payload')
      .eq('id', id)
      .single();

    if (error || !row) {
      return res.status(404).json({ error: 'Email not found' });
    }

    let html = row.html;

    // Gift cards can always be re-rendered from what we stored.
    if (!html && row.email_type === 'gift_card' && row.payload && row.payload.code) {
      const p = row.payload;
      html = createGiftCardEmailTemplate({
        recipientName: p.recipientName || null,
        amountDisplay: amountDisplayFromCents(row.amount_cents || p.amountCents),
        code: p.code,
        message: p.message || null,
        shopUrl: process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters',
        isRecipient: !!p.isRecipient
      });
      // Cache it for next time — best-effort, don't block the response.
      supabase.from('email_log').update({ html }).eq('id', row.id).then(null, () => {});
    }

    // Otherwise, try a live fetch from Resend (needs a read-enabled key).
    const readKey = process.env.RESEND_READ_API_KEY || process.env.RESEND_API_KEY;
    if (!html && row.resend_message_id && readKey) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(readKey);
        const got = await resend.emails.get(row.resend_message_id);
        html = got?.data?.html || null;
        if (html) {
          supabase.from('email_log').update({ html }).eq('id', row.id).then(null, () => {});
        }
      } catch (fetchErr) {
        console.warn('Resend email fetch failed:', fetchErr?.message);
      }
    }

    if (!html) {
      return res.status(404).json({ error: 'No preview is available for this email.' });
    }

    return res.status(200).json({ html, subject: row.subject, to: row.to_email });
  } catch (error) {
    console.error('Error loading email html:', error);
    return res.status(500).json({ error: 'Failed to load email preview' });
  }
};
