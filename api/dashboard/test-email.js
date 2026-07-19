/**
 * POST /api/dashboard/test-email  (auth required)
 * Body: { type: 'gift_card'|'workshop'|'retreat', to?: string }
 *
 * Sends a clearly-marked [TEST] sample email of the chosen type so staff can
 * preview how each email looks / verify deliverability. Defaults to sending to
 * the signed-in user. Logged like any other email (with payload.test = true).
 */

const { requireAuth } = require('../../lib/auth.js');
const { createGiftCardEmailTemplate, createWorkshopEmailTemplate, createRetreatEmailTemplate } = require('../../lib/resend.js');
const { logEmail, resendMessageId } = require('../../lib/emailLog.js');
const { isValidEmail, readBody } = require('../../lib/util.js');
const { Resend } = require('resend');

const VALID_TYPES = ['gift_card', 'workshop', 'retreat'];

const SAMPLE_GUIDELINES =
  '<p>This is a <strong>sample</strong> email sent from the dashboard so you can preview how it looks. ' +
  'No real order is associated with it.</p>' +
  '<ul><li><strong>Date:</strong> To be announced</li><li><strong>Location:</strong> Katie Ann Clay Studio</li></ul>' +
  '<p>Bring your creativity — everything else is provided!</p>';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const type = body.type;
    const to = String(body.to || session.email || '').trim();

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid email type' });
    }
    if (!isValidEmail(to)) {
      return res.status(400).json({ error: 'Invalid recipient email' });
    }

    const shopUrl = process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters';
    let html;
    let subject;

    if (type === 'gift_card') {
      const amountDisplay = '$50.00';
      subject = `[TEST] Your ${amountDisplay} Gift Card from Katie Ann Clay`;
      html = createGiftCardEmailTemplate({
        recipientName: 'Sample Recipient',
        amountDisplay,
        code: 'KAC-SAMPLE-TESTCODE-0000',
        message: 'Here is a little something — this is a sample gift message.',
        shopUrl,
        isRecipient: false
      });
    } else if (type === 'workshop') {
      subject = '[TEST] Workshop Details: Sample Pottery Workshop';
      html = createWorkshopEmailTemplate(
        { name: 'Sample Pottery Workshop', guidelinesHtml: SAMPLE_GUIDELINES },
        { customerName: 'Sample Guest', orderId: 'TEST-ORDER' }
      );
    } else {
      subject = '[TEST] Retreat Details: Sample Clay Retreat';
      html = createRetreatEmailTemplate(
        { name: 'Sample Clay Retreat', guidelinesHtml: SAMPLE_GUIDELINES },
        { customerName: 'Sample Guest', orderId: 'TEST-ORDER' }
      );
    }

    const fromEmail = process.env.GIFT_CARD_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.GIFT_CARD_SENDER_NAME || 'Katie Ann Clay';
    if (!fromEmail || !process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email sending is not configured' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html
    });

    if (result?.error) {
      console.error('Test email send error:', result.error);
      return res.status(502).json({ error: result.error.message || 'Failed to send test email' });
    }

    await logEmail({
      emailType: type,
      toEmail: to,
      subject,
      status: 'sent',
      resendMessageId: resendMessageId(result),
      html,
      triggeredBy: session.email,
      payload: { test: true }
    });

    return res.status(200).json({ success: true, to, messageId: resendMessageId(result) });
  } catch (error) {
    console.error('Error sending test email:', error);
    return res.status(500).json({ error: 'Failed to send test email' });
  }
};
