/**
 * Resend API integration
 * Handles transactional email sending for workshop orientation emails
 */

const { Resend } = require('resend');

/**
 * Get Resend client instance
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
 * Create HTML email template for workshop orientation
 * @param {Object} workshopData - Workshop information
 * @param {Object} customerData - Customer information
 * @returns {string} HTML email content
 */
function createWorkshopEmailTemplate(workshopData, customerData) {
  const { name, guidelinesHtml } = workshopData;
  const { customerName, orderId } = customerData;

  // Use the custom email content if provided, otherwise fall back to long description
  const emailContent = guidelinesHtml || 'Workshop details will be provided soon.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workshop Orientation - ${name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .workshop-title {
            color: #2c3e50;
            font-size: 28px;
            margin: 0 0 10px 0;
        }
        .workshop-subtitle {
            color: #6c757d;
            font-size: 16px;
            margin: 0;
        }
        .email-content {
            margin: 25px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 4px solid #007bff;
        }
        .info-section {
            margin: 25px 0;
            padding: 20px;
            background: #e3f2fd;
            border-radius: 6px;
            border-left: 4px solid #2196f3;
        }
        .info-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin: 0 0 15px 0;
        }
        .info-item {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
        }
        .info-label {
            font-weight: 600;
            min-width: 100px;
            color: #495057;
        }
        .info-value {
            flex: 1;
            color: #212529;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
        }
        h1, h2, h3 { color: #2c3e50; }
        p { margin: 15px 0; }
        ul, ol { margin: 15px 0; padding-left: 25px; }
        li { margin: 8px 0; }
        strong { color: #2c3e50; }
        em { color: #7f8c8d; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="workshop-title">${name}</h1>
            <p class="workshop-subtitle">Workshop Orientation & Guidelines</p>
        </div>

        <div class="email-content">
            ${emailContent}
        </div>

        <div class="info-section">
            <h2 class="info-title">Order Details</h2>
            <div class="info-item">
                <span class="info-label">Order ID:</span>
                <span class="info-value">${orderId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Workshop:</span>
                <span class="info-value">${name}</span>
            </div>
        </div>

        <div class="footer">
            <p>If you have any questions, please don't hesitate to reach out to us.</p>
            <p>We look forward to seeing you at the workshop!</p>
            <p><em>Best regards,<br>Katie Ann Clay</em></p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Send workshop orientation email via Resend
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {Object} options.workshopData - Workshop information
 * @param {Object} options.customerData - Customer information
 * @param {string} [options.templateId] - Optional Resend template ID
 * @returns {Promise<Object>} Email send result
 */
async function sendWorkshopEmail({ email, workshopData, customerData, templateId }) {
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  try {
    // If template ID is provided, use Resend template
    if (templateId) {
      const result = await resend.emails.send({
        from: fromEmail,
        to: [email],
        template_id: templateId,
        template_data: {
          workshop_name: workshopData.name,
          workshop_email_content: workshopData.guidelinesHtml || 'Workshop details will be provided soon.',
          customer_name: customerData.customerName || 'Workshop Participant',
          order_id: customerData.orderId
        }
      });

      console.log(`Sent template email to ${email} using template ${templateId}`);
      return result;
    }

    // Otherwise, use custom HTML template
    const htmlContent = createWorkshopEmailTemplate(workshopData, customerData);
    
    const result = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Workshop Orientation: ${workshopData.name}`,
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
 * Send a simple test email
 * @param {string} email - Recipient email
 * @param {string} [subject] - Email subject
 * @returns {Promise<Object>} Email send result
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
 * Get email sending statistics (if available)
 * @returns {Promise<Object>} Statistics data
 */
async function getEmailStats() {
  const resend = getResendClient();

  try {
    // Note: Resend API doesn't have a direct stats endpoint
    // This would need to be implemented based on your needs
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
  sendTestEmail,
  getEmailStats
};
