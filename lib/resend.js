/**
 * Resend API integration for workshop emails
 */

const { Resend } = require('resend');

/**
 * Escape HTML special characters to prevent injection in email templates
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Get Resend client
 */
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error('Resend environment variables are required: RESEND_API_KEY, RESEND_FROM_EMAIL');
  }

  return new Resend(apiKey);
}

/**
 * Create HTML email template for workshop
 */
function createWorkshopEmailTemplate(workshopData, customerData) {
  const { name, guidelinesHtml } = workshopData;
  const { customerName, orderId } = customerData;

  const emailContent = guidelinesHtml || 'Workshop details will be provided soon.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workshop Details - ${name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            margin: 0;
            padding: 0;
        }
        .header {
            background: #274d5a;
            text-align: center;
            color: white;
        }
        .logo {
            width: 100%;
            height: 220px;
            margin: 0;
            background: #274d5a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .workshop-title {
            color: #274d5a;
            font-size: 28px;
            font-weight: 600;
            margin: 30px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .workshop-subtitle {
            color: #666;
            font-size: 16px;
            margin: 0 0 30px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .content-section {
            padding: 30px;
            background: white;
        }
        .email-content {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #f8f9fa;
            border-left: 4px solid #274d5a;
        }
        .info-section {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #274d5a;
            color: white;
        }
        .info-title {
            font-size: 18px;
            font-weight: 600;
            color: white;
            margin: 0 0 20px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .info-item {
            margin: 15px 0;
            display: flex;
            align-items: flex-start;
        }
        .info-label {
            font-weight: 600;
            min-width: 100px;
            color: #a8d4e0;
            text-transform: uppercase;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        .info-value {
            flex: 1;
            color: white;
        }
        .footer {
            background: #274d5a;
            padding: 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .footer p {
            margin: 10px 0;
        }
        .signature {
            color: #274d5a;
            font-weight: 600;
            margin-top: 20px;
        }
        h1, h2, h3 { 
            color: #274d5a; 
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        p { margin: 15px 0; }
        ul, ol { margin: 15px 0; padding-left: 25px; }
        li { margin: 8px 0; }
        strong { color: #274d5a; font-weight: 600; }
        em { color: #666; }
        a { color: #274d5a; text-decoration: none; font-weight: 600; }
        a:hover { text-decoration: underline; }
        .highlight {
            background: #274d5a;
            color: white;
            padding: 20px;
            margin: 20px 0;
        }
        .highlight strong {
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="https://cdn.prod.website-files.com/5d2b6c55187e93f15bc32a32/68be2adc42edee3a305903f6_katie-logo-square-white.jpg" alt="Katie Ann Clay Logo" />
            </div>
        </div>

        <div class="content-section">
            <h2 class="workshop-title">${name}</h2>
            <p class="workshop-subtitle">Workshop Details</p>

            <div class="email-content">
                ${emailContent}
            </div>

            <div class="info-section">
                <h3 class="info-title">Order Details</h3>
                <div class="info-item">
                    <span class="info-label">Order ID:</span>
                    <span class="info-value">${orderId}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Workshop:</span>
                    <span class="info-value">${name}</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>If you have any questions, please don't hesitate to reach out to us.</p>
            <p>We look forward to seeing you at the workshop!</p>
            <p class="signature">Best regards,<br>Katie Ann Clay</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Send workshop email via Resend
 */
async function sendWorkshopEmail({ email, workshopData, customerData, templateId }) {
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  try {
    if (templateId) {
      const result = await resend.emails.send({
        from: fromEmail,
        to: [email],
        template_id: templateId,
        template_data: {
          workshop_name: workshopData.name,
          workshop_email_content: workshopData.guidelinesHtml || 'Workshop details will be provided soon.',
          customer_name: customerData.customerName || 'Friend',
          order_id: customerData.orderId
        }
      });

      console.log(`Sent template email to ${email} using template ${templateId}`);
      return result;
    }

    const htmlContent = createWorkshopEmailTemplate(workshopData, customerData);
    
    const result = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Workshop Details: ${workshopData.name}`,
      html: htmlContent
    });

    console.log(`Sent custom email to ${email} for workshop: ${workshopData.name}`);
    return result;

  } catch (error) {
    console.error(`Error sending email to ${email}:`, error);
    throw error;
  }
}

/**
 * Create HTML email template for retreat (passes and accommodations)
 */
function createRetreatEmailTemplate(retreatData, customerData) {
  const { name, guidelinesHtml } = retreatData;
  const { customerName, orderId } = customerData;

  const emailContent = guidelinesHtml || 'Retreat details will be provided soon.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retreat Details - ${name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            margin: 0;
            padding: 0;
        }
        .header {
            background: #274d5a;
            text-align: center;
            color: white;
        }
        .logo {
            width: 100%;
            height: 220px;
            margin: 0;
            background: #274d5a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .retreat-title {
            color: #274d5a;
            font-size: 28px;
            font-weight: 600;
            margin: 30px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .retreat-subtitle {
            color: #666;
            font-size: 16px;
            margin: 0 0 30px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .content-section {
            padding: 30px;
            background: white;
        }
        .email-content {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #f8f9fa;
            border-left: 4px solid #274d5a;
        }
        .info-section {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #274d5a;
            color: white;
        }
        .info-title {
            font-size: 18px;
            font-weight: 600;
            color: white;
            margin: 0 0 20px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .info-item {
            margin: 15px 0;
            display: flex;
            align-items: flex-start;
        }
        .info-label {
            font-weight: 600;
            min-width: 100px;
            color: #a8d4e0;
            text-transform: uppercase;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        .info-value {
            flex: 1;
            color: white;
        }
        .footer {
            background: #274d5a;
            padding: 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .footer p {
            margin: 10px 0;
        }
        .signature {
            color: #274d5a;
            font-weight: 600;
            margin-top: 20px;
        }
        h1, h2, h3 {
            color: #274d5a;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        p { margin: 15px 0; }
        ul, ol { margin: 15px 0; padding-left: 25px; }
        li { margin: 8px 0; }
        strong { color: #274d5a; font-weight: 600; }
        em { color: #666; }
        a { color: #274d5a; text-decoration: none; font-weight: 600; }
        a:hover { text-decoration: underline; }
        .highlight {
            background: #274d5a;
            color: white;
            padding: 20px;
            margin: 20px 0;
        }
        .highlight strong {
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="https://cdn.prod.website-files.com/5d2b6c55187e93f15bc32a32/68be2adc42edee3a305903f6_katie-logo-square-white.jpg" alt="Katie Ann Clay Logo" />
            </div>
        </div>

        <div class="content-section">
            <h2 class="retreat-title">${name}</h2>
            <p class="retreat-subtitle">Retreat Details</p>

            <div class="email-content">
                ${emailContent}
            </div>

            <div class="info-section">
                <h3 class="info-title">Order Details</h3>
                <div class="info-item">
                    <span class="info-label">Order ID:</span>
                    <span class="info-value">${orderId}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Item:</span>
                    <span class="info-value">${name}</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>If you have any questions, please don't hesitate to reach out to us.</p>
            <p>We look forward to seeing you at the retreat!</p>
            <p class="signature">Best regards,<br>Katie Ann Clay</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Send retreat email via Resend
 */
async function sendRetreatEmail({ email, retreatData, customerData }) {
  const resend = getResendClient();
  const fromEmail = process.env.RETREAT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;

  try {
    const htmlContent = createRetreatEmailTemplate(retreatData, customerData);

    const result = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Retreat Details: ${retreatData.name}`,
      html: htmlContent
    });

    console.log(`Sent retreat email to ${email} for: ${retreatData.name}`);
    return result;

  } catch (error) {
    console.error(`Error sending retreat email to ${email}:`, error);
    throw error;
  }
}

/**
 * Create HTML email template for gift card
 */
function createGiftCardEmailTemplate({ recipientName, amountDisplay, code, message, shopUrl, isRecipient = false }) {
  const greeting = escapeHtml(recipientName || 'Friend');
  const giftMessage = escapeHtml(message || '');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gift Card - Katie Ann Clay</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            margin: 0;
            padding: 0;
        }
        .header {
            background: #274d5a;
            text-align: center;
            color: white;
        }
        .logo {
            width: 100%;
            height: 220px;
            margin: 0;
            background: #274d5a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .gift-card-title {
            color: #274d5a;
            font-size: 32px;
            font-weight: 600;
            margin: 30px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .gift-card-subtitle {
            color: #666;
            font-size: 18px;
            margin: 0 0 30px 0;
            letter-spacing: 0.5px;
        }
        .content-section {
            padding: 30px;
            background: white;
        }
        .gift-message {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #f8f9fa;
            border-left: 4px solid #274d5a;
            font-style: italic;
            color: #555;
        }
        .code-section {
            margin: 0 0 30px 0;
            padding: 30px;
            background: #274d5a;
            color: white;
            text-align: center;
        }
        .code-label {
            font-size: 14px;
            font-weight: 600;
            color: #a8d4e0;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 15px 0;
        }
        .code-value {
            font-size: 32px;
            font-weight: 700;
            color: white;
            letter-spacing: 3px;
            font-family: 'Courier New', monospace;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            word-break: break-all;
        }
        .instructions {
            margin: 0 0 30px 0;
            padding: 25px;
            background: #f8f9fa;
        }
        .instructions h3 {
            color: #274d5a;
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 15px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .instructions ol {
            margin: 15px 0;
            padding-left: 25px;
        }
        .instructions li {
            margin: 10px 0;
            color: #555;
        }
        .shop-button {
            display: inline-block;
            background: #274d5a;
            color: white;
            padding: 15px 40px;
            text-decoration: none;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .shop-button:hover {
            background: #1d3a44;
        }
        .footer {
            background: #274d5a;
            padding: 30px;
            text-align: center;
            color: #a8d4e0;
            font-size: 14px;
        }
        .footer p {
            margin: 10px 0;
            color: #a8d4e0;
        }
        .signature {
            color: white;
            font-weight: 600;
            margin-top: 20px;
        }
        .forward-notice {
            margin: 0 0 30px 0;
            padding: 20px;
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            color: #856404;
        }
        .forward-notice strong {
            color: #856404;
            font-weight: 600;
            display: block;
            margin-bottom: 8px;
            font-size: 16px;
        }
        .forward-notice p {
            margin: 0;
            color: #856404;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="https://cdn.prod.website-files.com/5d2b6c55187e93f15bc32a32/68be2adc42edee3a305903f6_katie-logo-square-white.jpg" alt="Katie Ann Clay Logo" />
            </div>
        </div>

        <div class="content-section">
            <h1 class="gift-card-title">Gift Card</h1>
            <p class="gift-card-subtitle">${isRecipient ? `Hi ${greeting}! You've received a ${amountDisplay} gift card to Katie Ann Clay!` : `You've received a ${amountDisplay} gift card to Katie Ann Clay!`}</p>

            ${giftMessage ? `<div class="gift-message">"${giftMessage}"</div>` : ''}

            <div class="code-section">
                <div class="code-label">Your Gift Card Code</div>
                <div class="code-value">${code}</div>
            </div>

            ${!isRecipient ? `
            <div class="forward-notice">
                <strong>📧 Forward This Email</strong>
                <p>Please forward this email to the gift card recipient so they can use the code to make their purchase.</p>
            </div>
            ` : ''}

            <div class="instructions">
                <h3>How to Redeem</h3>
                <ol>
                    <li>Visit our shop and add your desired items to cart</li>
                    <li>At checkout, enter your gift card code</li>
                    <li>The value will be applied to your order</li>
                    <li>Complete your purchase and enjoy!</li>
                </ol>
            </div>

            <div style="text-align: center;">
                <a href="${shopUrl}" class="shop-button">Shop Now</a>
            </div>
        </div>

        <div class="footer">
            <p>If you have any questions about your gift card, please don't hesitate to reach out to us.</p>
            <p class="signature">Best regards,<br>Katie Ann Clay</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Send gift card email via Resend
 */
async function sendGiftCardEmail({ to, recipientName, amountDisplay, code, message, shopUrl, isRecipient = false }) {
  const resend = getResendClient();
  const fromEmail = process.env.GIFT_CARD_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.GIFT_CARD_SENDER_NAME || 'Katie Ann Clay';

  if (!fromEmail) {
    throw new Error('GIFT_CARD_FROM_EMAIL or RESEND_FROM_EMAIL environment variable is required');
  }

  try {
    const htmlContent = createGiftCardEmailTemplate({
      recipientName,
      amountDisplay,
      code,
      message,
      shopUrl,
      isRecipient
    });
    
    const emailSubject = isRecipient 
      ? `You've received a ${amountDisplay} Gift Card from Katie Ann Clay!`
      : `Your ${amountDisplay} Gift Card from Katie Ann Clay`;
    
    console.log(`Attempting to send gift card email:`, {
      to,
      from: `${fromName} <${fromEmail}>`,
      amount: amountDisplay,
      isRecipient,
      hasHtmlContent: !!htmlContent
    });
    
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: emailSubject,
      html: htmlContent
    });

    console.log(`✅ Gift card email sent successfully:`, {
      to,
      amount: amountDisplay,
      resendId: result?.id,
      resendData: result?.data
    });
    return result;

  } catch (error) {
    console.error(`❌ Error sending gift card email to ${to}:`, {
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
      fromEmail,
      fromName
    });
    throw error;
  }
}

/**
 * Send a test email
 */
async function sendTestEmail(email, subject = 'Test Email from Katie Ann Clay Mailer') {
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: subject,
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from the Katie Ann Clay Mailer service.</p>
        <p>If you received this, the email system is working correctly!</p>
        <p><em>Sent at: ${new Date().toISOString()}</em></p>
      `
    });

    console.log(`Sent test email to ${email}`);
    return result;

  } catch (error) {
    console.error(`Error sending test email to ${email}:`, error);
    throw error;
  }
}

/**
 * Get email statistics
 */
async function getEmailStats() {
  const resend = getResendClient();

  try {
    return {
      message: 'Email stats not available via Resend API',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching email stats:', error);
    throw error;
  }
}

module.exports = {
  createWorkshopEmailTemplate,
  sendWorkshopEmail,
  createRetreatEmailTemplate,
  sendRetreatEmail,
  createGiftCardEmailTemplate,
  sendGiftCardEmail,
  sendTestEmail,
  getEmailStats
};
