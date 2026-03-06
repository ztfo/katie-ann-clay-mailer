/**
 * Webflow Order Webhook Handler
 * Processes workshop purchases and gift card purchases
 * Sends orientation emails and gift card emails
 */

const { resolveGuidelines, isWorkshopProduct, isRetreatProduct, isGiftCardProduct } = require('../../lib/webflow.js');
const { sendWorkshopEmail, sendRetreatEmail, sendGiftCardEmail } = require('../../lib/resend.js');
const { withBackoff } = require('../../lib/retry.js');
const { assignUnusedGiftCardCodeAtomically, markGiftCardSent, getGiftCardProduct, getGiftCardRecipientInfo, consumeGiftCardRecipientInfo } = require('../../lib/supabase.js');
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
  
  // Check Supabase variables if gift card processing might be needed
  // (We don't fail here since gift cards are optional, but we'll log a warning)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.warn('Supabase environment variables not set. Gift card processing will fail if gift cards are purchased.');
  }

  if (!process.env.WEBFLOW_RETREAT_PASSES_CATEGORY_ID || !process.env.WEBFLOW_RETREAT_ACCOMMODATIONS_CATEGORY_ID) {
    console.warn('Retreat category environment variables not set. Retreat product detection will be disabled.');
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
  
  // Check for customer email - Webflow uses customerInfo (not customer)
  const customerEmail = orderData.customerInfo?.email || orderData.customer?.email;
  if (!customerEmail || !customerEmail.includes('@')) {
    throw new Error('Invalid or missing customer email');
  }
  
  // Check for line items - Webflow uses purchasedItems (not lineItems)
  const lineItems = orderData.purchasedItems || orderData.lineItems || [];
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

    // Webflow uses orderId (not id)
    const orderId = orderData.orderId || orderData.id;
    
    if (isDebugMode) {
      console.log(`[${requestId}] Processing order ${orderId}`, {
        customerEmail: customerEmail?.substring(0, 3) + '***@' + customerEmail?.split('@')[1],
        lineItems: lineItems.map(item => ({
          productId: item.productId,
          name: item.productName || item.name,
          quantity: item.count || item.quantity || 1
        }))
      });
    }

    const results = [];
    
    for (const lineItem of lineItems) {
      if (isDebugMode) {
        console.log(`[${requestId}] Processing line item`, {
          productId: lineItem.productId,
          name: lineItem.productName || lineItem.name,
          quantity: lineItem.count || lineItem.quantity || 1
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
        
        // Check product type — retreat must be checked before workshop
        // because the legacy early bird retreat product has Service type
        const isRetreat = isRetreatProduct(productResponse.product);
        const isWorkshop = !isRetreat && isWorkshopProduct(productResponse.product);
        const isGiftCard = isGiftCardProduct(productResponse.product);

        console.log(`[${requestId}] Product check:`, {
          productId: lineItem.productId,
          productName: productResponse.product?.name,
          isRetreat,
          isWorkshop,
          isGiftCard,
          categories: productResponse.product?.fieldData?.category
        });

        if (!isRetreat && !isWorkshop && !isGiftCard) {
          console.log(`[${requestId}] ⏭️  Skipping product - not a retreat, workshop, or gift card`);
          results.push({
            productId: lineItem.productId,
            status: 'skipped',
            reason: 'Not a retreat, workshop, or gift card product'
          });
          continue;
        }

        // Process retreat (pass or accommodation)
        if (isRetreat) {
          console.log(`[${requestId}] 🏕️ Retreat product detected, fetching details...`);

          const guidelines = await withBackoff(() =>
            resolveGuidelines(process.env.WEBFLOW_SITE_ID, {
              productId: lineItem.productId
            })
          );

          if (!guidelines) {
            console.error(`[${requestId}] No content found for retreat product ${lineItem.productId}`);
            results.push({
              productId: lineItem.productId,
              status: 'error',
              error: 'No content found for retreat product'
            });
            continue;
          }

          const retreatData = {
            name: guidelines.name || lineItem.productName || lineItem.name,
            guidelinesHtml: guidelines.guidelinesHtml || 'Retreat details coming soon...'
          };

          const customerData = {
            customerName: orderData.customerInfo?.fullName || orderData.customer?.name || orderData.customer?.firstName || 'Retreat Guest',
            orderId: orderId
          };

          await withBackoff(() =>
            sendRetreatEmail({
              email: customerEmail,
              retreatData,
              customerData
            })
          );

          const result = {
            productId: lineItem.productId,
            status: 'success',
            type: 'retreat',
            retreatName: retreatData.name,
            emailSent: true
          };

          markAsProcessed(idempotencyKey, result);
          results.push(result);

          console.log(`Successfully sent retreat email for ${retreatData.name}`);
          continue;
        }

        // Process gift card
        if (isGiftCard) {
          // Log full lineItem structure to debug
          console.log(`[${requestId}] 🎁 Gift card detected! Full lineItem structure:`, JSON.stringify(lineItem, null, 2));
          
          // Get quantity - Webflow uses 'count' field (not 'quantity')
          const quantity = lineItem.count || lineItem.quantity || lineItem.qty || 1;
          
          console.log(`[${requestId}] 🎁 Gift card detected! Processing gift card product`, {
            productId: lineItem.productId,
            productName: productResponse.product?.name,
            quantity: quantity,
            rawCount: lineItem.count,
            rawQuantity: lineItem.quantity
          });
          
          try {
            // Get gift card product mapping
            console.log(`[${requestId}] Looking up gift card product mapping for ${lineItem.productId}`);
            const giftCardProduct = await getGiftCardProduct(lineItem.productId);
            
            if (!giftCardProduct) {
              console.error(`[${requestId}] ❌ No gift card product mapping found for product ${lineItem.productId}`);
              results.push({
                productId: lineItem.productId,
                status: 'error',
                error: 'Gift card product not configured in database'
              });
              continue;
            }

            const amountCents = giftCardProduct.amount_cents;
            const amountDisplay = `$${(amountCents / 100).toFixed(2)}`;
            
            console.log(`[${requestId}] ✅ Found gift card mapping: ${amountDisplay} (${amountCents} cents)`);
            console.log(`[${requestId}] Processing ${quantity} gift card(s)...`);

            // Look up recipient info from database once (stored via product page form)
            // This is the primary method since Webflow checkout doesn't support custom fields
            let storedRecipientInfo = null;
            try {
              storedRecipientInfo = await getGiftCardRecipientInfo({
                purchaserEmail: customerEmail,
                productId: lineItem.productId
              });
              if (storedRecipientInfo) {
                console.log(`[${requestId}] ✅ Found stored recipient info for purchaser ${customerEmail}`);
              }
            } catch (error) {
              console.warn(`[${requestId}] ⚠️ Error looking up recipient info:`, error.message);
              // Continue processing even if lookup fails
            }

            // Extract gift message and recipient info from order
            // Priority: stored recipient info > order customFields > order notes
            const giftMessage =
              storedRecipientInfo?.message ||
              orderData.customFields?.giftMessage ||
              orderData.customFields?.['gift-message'] ||
              orderData.customFields?.['gift_message'] ||
              orderData.notes?.giftMessage ||
              (typeof orderData.notes === 'string' ? orderData.notes : null) ||
              lineItem.customFields?.giftMessage ||
              lineItem.customFields?.['gift-message'] ||
              orderData.metadata?.giftMessage ||
              null;

            const recipientName =
              storedRecipientInfo?.recipient_name ||
              orderData.customFields?.recipientName ||
              orderData.customFields?.['recipient-name'] ||
              orderData.customFields?.['recipient_name'] ||
              orderData.customFields?.recipient ||
              null;

            const recipientEmail =
              storedRecipientInfo?.recipient_email ||
              orderData.customFields?.recipientEmail ||
              orderData.customFields?.['recipient-email'] ||
              orderData.customFields?.['recipient_email'] ||
              null;

            if (giftMessage) {
              console.log(`[${requestId}] 📝 Gift message found: ${giftMessage.substring(0, 50)}...`);
            }
            if (recipientName) {
              console.log(`[${requestId}] 👤 Recipient name found: ${recipientName}`);
            }
            if (recipientEmail) {
              console.log(`[${requestId}] 📧 Recipient email found: ${recipientEmail}`);
            }

            // Process each quantity unit
            for (let i = 0; i < quantity; i++) {
              console.log(`[${requestId}] Processing gift card ${i + 1}/${quantity} for ${amountDisplay}`);

              // Atomically assign unused code (prevents race conditions)
              console.log(`[${requestId}] Atomically assigning unused gift card code for ${amountDisplay}...`);
              let giftCardCode;
              try {
                giftCardCode = await withBackoff(() => 
                  assignUnusedGiftCardCodeAtomically({
                    amountCents,
                    order: { orderId, id: orderId },
                    purchaser: { email: customerEmail },
                    recipient: giftMessage || recipientName || recipientEmail ? {
                      email: recipientEmail,
                      name: recipientName,
                      message: giftMessage
                    } : null
                  })
                );
                console.log(`[${requestId}] ✅ Atomically assigned code: ...${giftCardCode.code.slice(-4)} (ID: ${giftCardCode.id})`);
              } catch (error) {
                if (error.message && error.message.includes('No unused gift card codes available')) {
                  console.error(`[${requestId}] ❌ No unused gift card codes available for ${amountDisplay}`);
                  results.push({
                    productId: lineItem.productId,
                    status: 'error',
                    error: `No unused gift card codes available for ${amountDisplay}`,
                    quantity: i + 1
                  });
                  // Alert: Consider sending an internal notification email here
                  continue;
                }
                throw error;
              }

              // Send gift card email to purchaser
              // Use message from database (if stored) or from order data
              const emailMessage = giftCardCode.message || giftMessage;
              const emailRecipientName = giftCardCode.recipient_name || recipientName || orderData.customerInfo?.fullName || orderData.customer?.name || orderData.customer?.firstName;
              
              console.log(`[${requestId}] 📧 Sending gift card email to purchaser ${customerEmail} for ${amountDisplay}...`);
              if (emailMessage) {
                console.log(`[${requestId}] 📝 Including gift message in email`);
              }
              const purchaserEmailResult = await withBackoff(() => 
                sendGiftCardEmail({
                  to: customerEmail,
                  recipientName: emailRecipientName,
                  amountDisplay,
                  code: giftCardCode.code,
                  message: emailMessage,
                  shopUrl: process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters',
                  isRecipient: false // This is the purchaser email
                })
              );

              console.log(`[${requestId}] ✅ Gift card email sent to purchaser successfully`, {
                email: customerEmail,
                amount: amountDisplay,
                resendId: purchaserEmailResult?.id || 'unknown'
              });

              // Also send email to recipient if recipient email is provided
              if (recipientEmail && recipientEmail !== customerEmail) {
                console.log(`[${requestId}] 📧 Sending gift card email to recipient ${recipientEmail} for ${amountDisplay}...`);
                try {
                  const recipientEmailResult = await withBackoff(() => 
                    sendGiftCardEmail({
                      to: recipientEmail,
                      recipientName: recipientName || 'Friend',
                      amountDisplay,
                      code: giftCardCode.code,
                      message: emailMessage,
                      shopUrl: process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters',
                      isRecipient: true // This is the recipient email
                    })
                  );

                  console.log(`[${requestId}] ✅ Gift card email sent to recipient successfully`, {
                    email: recipientEmail,
                    amount: amountDisplay,
                    resendId: recipientEmailResult?.id || 'unknown'
                  });
                } catch (recipientError) {
                  console.error(`[${requestId}] ❌ Failed to send email to recipient ${recipientEmail}:`, recipientError);
                  // Don't fail the entire process if recipient email fails
                  // Purchaser email was already sent successfully
                }
              } else if (recipientEmail === customerEmail) {
                console.log(`[${requestId}] ℹ️ Recipient email same as purchaser, skipping duplicate email`);
              }

              // Mark as sent
              console.log(`[${requestId}] Marking code as sent in database...`);
              await withBackoff(() => 
                markGiftCardSent({ codeId: giftCardCode.id })
              );

              console.log(`[${requestId}] ✅ Successfully completed gift card ${amountDisplay} (code: ...${giftCardCode.code.slice(-4)})`);
            }

            // Consume recipient info so it's not reused for future orders
            if (storedRecipientInfo?.id) {
              try {
                await consumeGiftCardRecipientInfo(storedRecipientInfo.id);
                console.log(`[${requestId}] 🗑️ Consumed recipient info record ${storedRecipientInfo.id}`);
              } catch (error) {
                console.warn(`[${requestId}] ⚠️ Failed to consume recipient info:`, error.message);
              }
            }

            const result = {
              productId: lineItem.productId,
              status: 'success',
              type: 'gift_card',
              amount: amountDisplay,
              quantity: quantity,
              emailsSent: quantity
            };
            
            markAsProcessed(idempotencyKey, result);
            results.push(result);
            continue;

          } catch (error) {
            console.error(`[${requestId}] Error processing gift card:`, {
              error: error.message,
              stack: error.stack,
              productId: lineItem.productId,
              orderId
            });
            results.push({
              productId: lineItem.productId,
              status: 'error',
              type: 'gift_card',
              error: error.message
            });
            // Don't throw - allow other line items to process
            continue;
          }
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
          name: guidelines.name || lineItem.productName || lineItem.name,
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
          customerName: orderData.customerInfo?.fullName || orderData.customer?.name || orderData.customer?.firstName || 'Workshop Participant',
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
