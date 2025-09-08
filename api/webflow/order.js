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

// In-memory store for idempotency (in production, use Redis or database)
const processedOrders = new Map();
const MAX_CACHE_SIZE = 1000; // Prevent memory leaks

/**
 * Verify webhook signature to ensure request is from Webflow
 * @param {Object} payload - Request body
 * @param {string} signature - X-Webflow-Signature header
 * @param {string} secret - Webhook secret from environment
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) {
    console.warn('Missing webhook signature or secret');
    return false;
  }
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
      
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Validate required environment variables
 * @throws {Error} If any required variables are missing
 */
function validateEnvironment() {
  const required = ['WEBFLOW_SITE_ID', 'WEBFLOW_API_TOKEN', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Validate webhook payload structure
 * @param {Object} payload - Webhook payload
 * @returns {Object} Validated payload with customerEmail and lineItems
 * @throws {Error} If payload is invalid
 */
function validateWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload format');
  }
  
  const orderData = payload.payload || payload;
  
  // Check for customer email
  const customerEmail = orderData.customer?.email || orderData.customerInfo?.email;
  if (!customerEmail || !customerEmail.includes('@')) {
    throw new Error('Invalid or missing customer email');
  }
  
  // Check for line items
  const lineItems = orderData.lineItems || orderData.purchasedItems || [];
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('No items in order');
  }
  
  return { customerEmail, lineItems, orderData };
}

/**
 * Check if an order has already been processed (idempotency)
 * @param {string} idempotencyKey - Unique key for the order
 * @returns {boolean} True if already processed
 */
function isAlreadyProcessed(idempotencyKey) {
  return processedOrders.has(idempotencyKey);
}

/**
 * Mark an order as processed (idempotency)
 * @param {string} idempotencyKey - Unique key for the order
 * @param {Object} result - Processing result to store
 */
function markAsProcessed(idempotencyKey, result) {
  // Prevent memory leaks by limiting cache size
  if (processedOrders.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries (simple FIFO)
    const firstKey = processedOrders.keys().next().value;
    processedOrders.delete(firstKey);
  }
  
  processedOrders.set(idempotencyKey, {
    processedAt: new Date().toISOString(),
    result: result
  });
}

module.exports = async function handler(req, res) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Type', 'application/json');

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate environment variables
    validateEnvironment();

    // Verify webhook signature for security
    const signature = req.headers['x-webflow-signature'];
    const secret = process.env.WEBFLOW_WEBHOOK_SECRET;
    
    if (!verifyWebhookSignature(req.body, signature, secret)) {
      console.warn('Invalid webhook signature received', {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Validate and parse webhook payload
    const { customerEmail, lineItems, orderData } = validateWebhookPayload(req.body);

    const orderId = orderData.orderId || orderData.id;
    
    console.log(`Processing order ${orderId}`);

    // Process each line item (workshop)
    const results = [];
    
    for (const lineItem of lineItems) {
      try {
        // Generate idempotency key to prevent duplicate processing
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${orderId}-${customerEmail}-${lineItem.productId}`)
          .digest('hex');

        // Check if already processed (idempotency)
        if (isAlreadyProcessed(idempotencyKey)) {
          console.log(`Order ${orderId} already processed, skipping`);
          results.push({
            productId: lineItem.productId,
            status: 'skipped',
            reason: 'Already processed'
          });
          continue;
        }

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

        // Mark as processed (idempotency)
        const result = {
          productId: lineItem.productId,
          status: 'success',
          workshopName: workshopData.name,
          emailSent: true
        };
        
        markAsProcessed(idempotencyKey, result);
        results.push(result);

        console.log(`Successfully sent workshop email for ${workshopData.name}`);

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
    
    // Don't expose internal error details to public
    const isValidationError = error.message.includes('Invalid') || error.message.includes('Missing');
    const errorMessage = isValidationError ? error.message : 'Internal processing error';
    
    // Return 200 to prevent retry storms from Webflow
    res.status(200).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}
