/**
 * Webflow Order Webhook Handler
 * POST /api/webflow/order
 * 
 * Receives order webhooks from Webflow e-commerce
 * Processes workshop purchases and sends orientation emails via Resend
 */

const { resolveGuidelines, isWorkshopProduct } = require('../../lib/webflow.js');
const { sendWorkshopEmail } = require('../../lib/resend.js');
const { withBackoff } = require('../../lib/retry.js');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // TODO: Add webhook signature verification
    // const signature = req.headers['x-webflow-signature'];
    // if (!verifyWebhookSignature(req.body, signature)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    const order = req.body;
    
    // Validate required order data
    if (!order.customer?.email || !order.lineItems?.length) {
      console.error('Invalid order payload:', { 
        hasEmail: !!order.customer?.email, 
        hasLineItems: !!order.lineItems?.length 
      });
      return res.status(400).json({ error: 'Invalid order payload' });
    }

    const customerEmail = order.customer.email;
    const orderId = order.orderId;
    
    console.log(`Processing order ${orderId} for ${customerEmail}`);

    // Process each line item (workshop)
    const results = [];
    
    for (const lineItem of order.lineItems) {
      try {
        // Generate idempotency key to prevent duplicate processing
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${orderId}-${customerEmail}-${lineItem.productId}`)
          .digest('hex');

        // TODO: Check if already processed (implement idempotency)
        // if (await isAlreadyProcessed(idempotencyKey)) {
        //   console.log(`Order ${orderId} already processed, skipping`);
        //   continue;
        // }

        // First, check if this is a workshop product
        const productResponse = await withBackoff(() => 
          require('../../lib/webflow.js').getProduct(process.env.WEBFLOW_SITE_ID, lineItem.productId)
        );
        
        if (!isWorkshopProduct(productResponse.product)) {
          console.log(`Product ${lineItem.productId} is not a workshop, skipping email`);
          results.push({
            productId: lineItem.productId,
            status: 'skipped',
            reason: 'Not a workshop product'
          });
          continue;
        }

        // Fetch workshop guidelines and metadata
        const guidelines = await withBackoff(() => 
          resolveGuidelines(process.env.WEBFLOW_SITE_ID, {
            productId: lineItem.productId
          })
        );

        if (!guidelines) {
          console.error(`No guidelines found for product ${lineItem.productId}`);
          continue;
        }

        // Prepare workshop data for email
        const workshopData = {
          name: guidelines.name || lineItem.name,
          date: guidelines.date || 'TBD',
          location: guidelines.location || 'TBD',
          guidelinesHtml: guidelines.guidelinesHtml || 'Guidelines coming soon...',
          duration: guidelines.duration,
          whatToBring: guidelines.whatToBring,
          parking: guidelines.parking,
          reschedulePolicy: guidelines.reschedulePolicy,
          faq: guidelines.faq
        };

        // Prepare customer data
        const customerData = {
          customerName: order.customer?.name || order.customer?.firstName || 'Workshop Participant',
          orderId: orderId
        };

        // Send workshop orientation email via Resend
        await withBackoff(() => 
          sendWorkshopEmail({
            email: customerEmail,
            workshopData,
            customerData,
            templateId: process.env.RESEND_TEMPLATE_ID // Optional: use pre-built template
          })
        );

        // TODO: Mark as processed (implement idempotency)
        // await markAsProcessed(idempotencyKey);

        results.push({
          productId: lineItem.productId,
          status: 'success',
          workshopName: workshopData.name,
          emailSent: true
        });

        console.log(`Successfully sent workshop email for ${workshopData.name} to ${customerEmail}`);

      } catch (error) {
        console.error(`Error processing line item ${lineItem.productId}:`, error);
        results.push({
          productId: lineItem.productId,
          status: 'error',
          error: error.message
        });
      }
    }

    // Always return 200 to prevent Webflow retries
    res.status(200).json({
      success: true,
      orderId,
      customerEmail,
      results,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Return 200 to prevent retry storms
    res.status(200).json({
      success: false,
      error: 'Internal processing error',
      timestamp: new Date().toISOString()
    });
  }
}
