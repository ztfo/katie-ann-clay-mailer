/**
 * POST /api/dashboard/resend  (auth required)
 * Body: { id }  - the email_log row to resend.
 *
 * Reconstructs the email from the stored snapshot and sends it again:
 *   - gift_card: rebuilt from the stored code + amount (no Webflow needed)
 *   - workshop/retreat: guidelines re-fetched fresh from Webflow by product id
 * Records a new email_log row with status 'resent', linked to the original and
 * stamped with the dashboard user who triggered it.
 */

const { getSupabaseClient } = require('../../lib/supabase.js');
const { requireAuth } = require('../../lib/auth.js');
const { sendGiftCardEmail, sendWorkshopEmail, sendRetreatEmail, createGiftCardEmailTemplate, createWorkshopEmailTemplate, createRetreatEmailTemplate } = require('../../lib/resend.js');
const { resolveGuidelines } = require('../../lib/webflow.js');
const { withBackoff } = require('../../lib/retry.js');
const { logEmail, resendMessageId } = require('../../lib/emailLog.js');
const { amountDisplayFromCents, readBody } = require('../../lib/util.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const id = body.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing email id' });
    }

    const supabase = getSupabaseClient();
    const { data: row, error } = await supabase
      .from('email_log')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const payload = row.payload || {};
    const shopUrl = process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters';
    let result;
    let subject;
    let html = null;

    if (row.email_type === 'gift_card') {
      if (!payload.code) {
        return res.status(422).json({ error: 'This gift card email has no stored code and cannot be resent.' });
      }
      const amountDisplay = amountDisplayFromCents(row.amount_cents || payload.amountCents);
      const isRecipient = !!payload.isRecipient;
      subject = isRecipient
        ? `You've received a ${amountDisplay} Gift Card from Katie Ann Clay!`
        : `Your ${amountDisplay} Gift Card from Katie Ann Clay`;

      const giftArgs = {
        recipientName: payload.recipientName || null,
        amountDisplay,
        code: payload.code,
        message: payload.message || null,
        shopUrl,
        isRecipient
      };
      html = createGiftCardEmailTemplate(giftArgs);
      result = await withBackoff(() => sendGiftCardEmail({ to: row.to_email, ...giftArgs }));
    } else if (row.email_type === 'workshop' || row.email_type === 'retreat') {
      const productId = row.product_id || payload.productId;
      if (!productId) {
        return res.status(422).json({ error: 'No product id stored for this email; cannot rebuild it.' });
      }

      const guidelines = await withBackoff(() =>
        resolveGuidelines(process.env.WEBFLOW_SITE_ID, { productId })
      );
      if (!guidelines) {
        return res.status(422).json({ error: 'Could not load current content for this product from Webflow.' });
      }

      const name = guidelines.name || payload.name || 'Katie Ann Clay';
      const customerData = {
        customerName: payload.customerName || null,
        orderId: row.webflow_order_id || payload.orderId || null
      };

      if (row.email_type === 'workshop') {
        subject = `Workshop Details: ${name}`;
        const workshopData = { name, guidelinesHtml: guidelines.guidelinesHtml || 'Guidelines coming soon...' };
        html = createWorkshopEmailTemplate(workshopData, customerData);
        result = await withBackoff(() =>
          sendWorkshopEmail({
            email: row.to_email,
            workshopData,
            customerData,
            templateId: process.env.RESEND_TEMPLATE_ID
          })
        );
      } else {
        subject = `Retreat Details: ${name}`;
        const retreatData = { name, guidelinesHtml: guidelines.guidelinesHtml || 'Retreat details coming soon...' };
        html = createRetreatEmailTemplate(retreatData, customerData);
        result = await withBackoff(() =>
          sendRetreatEmail({
            email: row.to_email,
            retreatData,
            customerData
          })
        );
      }
    } else {
      return res.status(422).json({ error: `Unknown email type: ${row.email_type}` });
    }

    const messageId = resendMessageId(result);

    const logged = await logEmail({
      emailType: row.email_type,
      toEmail: row.to_email,
      recipientRole: row.recipient_role,
      subject: subject || row.subject,
      status: 'resent',
      resendMessageId: messageId,
      webflowOrderId: row.webflow_order_id,
      productId: row.product_id,
      giftCardCodeId: row.gift_card_code_id,
      amountCents: row.amount_cents,
      html: html || row.html || null,
      payload,
      resentFrom: row.id,
      triggeredBy: session.email
    });

    return res.status(200).json({
      success: true,
      messageId,
      to: row.to_email,
      logId: logged?.id || null
    });
  } catch (error) {
    console.error('Error resending email:', error);
    return res.status(500).json({ error: 'Failed to resend email. Please try again.' });
  }
};
