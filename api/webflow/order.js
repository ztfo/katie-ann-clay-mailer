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
function verifyWebhookSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) {
    console.warn('Missing webhook signature, timestamp, or secret');
    return false;
  }
  
  try {
    // Webflow signature format: timestamp:rawBody
    const content = `${timestamp}:${rawBody}`;
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(content)
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
  const requestId = crypto.randomBytes(8).toString('hex');
  const startTime = Date.now();
  const isDebugMode = process.env.DEBUG_LOGGING === 'true';
  
  if (isDebugMode) {
    console.log(`[${requestId}] Webhook request started`, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']?.substring(0, 50) + '...',
        'x-forwarded-for': req.headers['x-forwarded-for']
      },
      bodySize: req.body ? JSON.stringify(req.body).length : 0
    });
  }

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Type', 'application/json');

  // Only allow POST requests
  if (req.method !== 'POST') {
    if (isDebugMode) {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate environment variables
    if (isDebugMode) {
      console.log(`[${requestId}] Validating environment variables`);
    }
    validateEnvironment();
    if (isDebugMode) {
      console.log(`[${requestId}] Environment validation passed`);
    }

    // Get raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    // Verify webhook signature for security (using raw body)
    const signature = req.headers['x-webflow-signature'];
    const timestamp = req.headers['x-webflow-timestamp'];
    const secret = process.env.WEBFLOW_WEBHOOK_SECRET;
    
    if (isDebugMode) {
      console.log(`[${requestId}] Verifying webhook signature`, {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        hasSecret: !!secret,
        signatureLength: signature ? signature.length : 0,
        timestamp: timestamp
      });
    }
    
    if (!verifyWebhookSignature(rawBody, signature, timestamp, secret)) {
      console.warn(`[${requestId}] Invalid webhook signature received`, {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
        signature: signature ? signature.substring(0, 8) + '...' : 'missing',
        timestamp: timestamp
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    if (isDebugMode) {
      console.log(`[${requestId}] Webhook signature verified successfully`);
    }
    
    // Parse webhook payload after signature verification
    let payload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (isDebugMode) {
        console.log(`[${requestId}] Payload parsed successfully`, {
          triggerType: payload.triggerType,
          hasPayload: !!payload.payload,
          payloadKeys: payload.payload ? Object.keys(payload.payload) : []
        });
      }
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse webhook payload:`, parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    
    // Validate webhook payload
    if (isDebugMode) {
      console.log(`[${requestId}] Validating webhook payload`);
    }
    const { customerEmail, lineItems, orderData } = validateWebhookPayload(payload);
    if (isDebugMode) {
      console.log(`[${requestId}] Payload validation passed`, {
        customerEmail: customerEmail?.substring(0, 3) + '***@' + customerEmail?.split('@')[1],
        lineItemsCount: lineItems.length,
        orderId: orderData.orderId || orderData.id
      });
    }

    const orderId = orderData.orderId || orderData.id;
    
    if (isDebugMode) {
      console.log(`[${requestId}] Processing order ${orderId}`, {
        customerEmail: customerEmail?.substring(0, 3) + '***@' + customerEmail?.split('@')[1],
        lineItems: lineItems.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity
        }))
      });
    }

    // Process each line item (workshop)
    const results = [];
    
    for (const lineItem of lineItems) {
      if (isDebugMode) {
        console.log(`[${requestId}] Processing line item`, {
          productId: lineItem.productId,
          name: lineItem.name,
          quantity: lineItem.quantity
        });
      }
      
      try {
        // Generate idempotency key to prevent duplicate processing
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${orderId}-${customerEmail}-${lineItem.productId}`)
          .digest('hex');

        if (isDebugMode) {
          console.log(`[${requestId}] Generated idempotency key: ${idempotencyKey.substring(0, 8)}...`);
        }

        // Check if already processed (idempotency)
        if (isAlreadyProcessed(idempotencyKey)) {
          if (isDebugMode) {
            console.log(`[${requestId}] Order ${orderId} already processed, skipping`);
          }
          results.push({
            productId: lineItem.productId,
            status: 'skipped',
            reason: 'Already processed'
          });
          continue;
        }

        // First, check if this is a workshop product
        if (isDebugMode) {
          console.log(`[${requestId}] Fetching product data from Webflow`, {
            productId: lineItem.productId
          });
        }
        
        const productResponse = await withBackoff(() => 
          require('../../lib/webflow.js').getProduct(process.env.WEBFLOW_SITE_ID, lineItem.productId)
        );
        
        if (isDebugMode) {
          console.log(`[${requestId}] Product data fetched`, {
            productId: lineItem.productId,
            productName: productResponse.product?.name,
            hasProduct: !!productResponse.product,
            isWorkshop: isWorkshopProduct(productResponse.product)
          });
        }
        
        if (!isWorkshopProduct(productResponse.product)) {
          if (isDebugMode) {
            console.log(`[${requestId}] Product ${lineItem.productId} is not a workshop, skipping email`);
          }
          results.push({
            productId: lineItem.productId,
            status: 'skipped',
            reason: 'Not a workshop product'
          });
          continue;
        }

        // Fetch workshop guidelines and metadata
        if (isDebugMode) {
          console.log(`[${requestId}] Fetching workshop guidelines`, {
            productId: lineItem.productId
          });
        }
        
        const guidelines = await withBackoff(() => 
          resolveGuidelines(process.env.WEBFLOW_SITE_ID, {
            productId: lineItem.productId
          })
        );

        if (isDebugMode) {
          console.log(`[${requestId}] Guidelines fetched`, {
            productId: lineItem.productId,
            hasGuidelines: !!guidelines,
            guidelinesKeys: guidelines ? Object.keys(guidelines) : []
          });
        }

        if (!guidelines) {
          console.error(`[${requestId}] No guidelines found for product ${lineItem.productId}`);
          results.push({
            productId: lineItem.productId,
            status: 'error',
            error: 'No guidelines found for workshop'
          });
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

        if (isDebugMode) {
          console.log(`[${requestId}] Workshop data prepared`, {
            name: workshopData.name,
            date: workshopData.date,
            location: workshopData.location,
            hasGuidelinesHtml: !!workshopData.guidelinesHtml
          });
        }

        // Prepare customer data
        const customerData = {
          customerName: orderData.customer?.name || orderData.customer?.firstName || 'Workshop Participant',
          orderId: orderId
        };

        if (isDebugMode) {
          console.log(`[${requestId}] Customer data prepared`, {
            customerName: customerData.customerName,
            orderId: customerData.orderId
          });
        }

        // Send workshop orientation email via Resend
        if (isDebugMode) {
          console.log(`[${requestId}] Sending workshop email`, {
            email: customerEmail?.substring(0, 3) + '***@' + customerEmail?.split('@')[1],
            workshopName: workshopData.name,
            hasTemplateId: !!process.env.RESEND_TEMPLATE_ID
          });
        }
        
        await withBackoff(() => 
          sendWorkshopEmail({
            email: customerEmail,
            workshopData,
            customerData,
            templateId: process.env.RESEND_TEMPLATE_ID // Optional: use pre-built template
          })
        );
        
        if (isDebugMode) {
          console.log(`[${requestId}] Workshop email sent successfully`);
        }

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
        console.error(`[${requestId}] Error processing line item ${lineItem.productId}:`, {
          error: error.message,
          stack: error.stack,
          productId: lineItem.productId,
          orderId
        });
        results.push({
          productId: lineItem.productId,
          status: 'error',
          error: error.message
        });
      }
    }

    const processingTime = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    // Always log summary (not sensitive)
    console.log(`[${requestId}] Order processing completed`, {
      orderId,
      processingTimeMs: processingTime,
      results: {
        total: results.length,
        success: successCount,
        error: errorCount,
        skipped: skippedCount
      }
    });

    if (isDebugMode) {
      console.log(`[${requestId}] Detailed results`, {
        results: results.map(r => ({
          productId: r.productId,
          status: r.status,
          error: r.error || r.reason
        }))
      });
    }

    // Always return 200 to prevent Webflow retries
    res.status(200).json({
      success: true,
      orderId,
      customerEmail,
      results,
      processedAt: new Date().toISOString(),
      processingTimeMs: processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error(`[${requestId}] Webhook processing error:`, {
      error: error.message,
      stack: error.stack,
      processingTimeMs: processingTime,
      orderId: req.body?.payload?.orderId || req.body?.payload?.id || 'unknown'
    });
    
    // Don't expose internal error details to public
    const isValidationError = error.message.includes('Invalid') || error.message.includes('Missing');
    const errorMessage = isValidationError ? error.message : 'Internal processing error';
    
    console.log(`[${requestId}] Returning error response`, {
      errorMessage,
      isValidationError,
      processingTimeMs: processingTime
    });
    
    // Return 200 to prevent retry storms from Webflow
    res.status(200).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime
    });
  }
}
