/**
 * Webflow Order Webhook Handler
 * Processes workshop purchases and sends orientation emails
 */

const { resolveGuidelines, isWorkshopProduct } = require('../../lib/webflow.js');
const { sendWorkshopEmail } = require('../../lib/resend.js');
const { withBackoff } = require('../../lib/retry.js');
const crypto = require('crypto');

const processedOrders = new Map();
const MAX_CACHE_SIZE = 1000;

/**
 * Verify webhook signature
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
 * Check if an order has already been processed
 */
function isAlreadyProcessed(idempotencyKey) {
  return processedOrders.has(idempotencyKey);
}

/**
 * Mark an order as processed
 */
function markAsProcessed(idempotencyKey, result) {
  if (processedOrders.size >= MAX_CACHE_SIZE) {
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
  const isDebugMode = false;
  
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

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    if (isDebugMode) {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (isDebugMode) {
      console.log(`[${requestId}] Validating environment variables`);
    }
    validateEnvironment();
    if (isDebugMode) {
      console.log(`[${requestId}] Environment validation passed`);
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
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
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${orderId}-${customerEmail}-${lineItem.productId}`)
          .digest('hex');

        if (isDebugMode) {
          console.log(`[${requestId}] Generated idempotency key: ${idempotencyKey.substring(0, 8)}...`);
        }

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
            templateId: process.env.RESEND_TEMPLATE_ID
          })
        );
        
        if (isDebugMode) {
          console.log(`[${requestId}] Workshop email sent successfully`);
        }

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
    
    const isValidationError = error.message.includes('Invalid') || error.message.includes('Missing');
    const errorMessage = isValidationError ? error.message : 'Internal processing error';
    
    console.log(`[${requestId}] Returning error response`, {
      errorMessage,
      isValidationError,
      processingTimeMs: processingTime
    });
    res.status(200).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime
    });
  }
}
