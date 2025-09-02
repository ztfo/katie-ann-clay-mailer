/**
 * Webflow Order Webhook Handler
 * POST /api/webflow/order
 * 
 * Receives order webhooks from Webflow e-commerce
 * Processes workshop purchases and triggers Mailchimp campaigns
 */

import { resolveGuidelines } from '../../lib/webflow.js';
import { upsertMember, triggerCampaign } from '../../lib/mailchimp.js';
import { withBackoff } from '../../lib/retry.js';
import crypto from 'crypto';

export default async function handler(req, res) {
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

        // Prepare Mailchimp merge fields
        const mergeFields = {
          WS_NAME: guidelines.name || lineItem.name,
          WS_DATE: guidelines.date || 'TBD',
          WS_LOC: guidelines.location || 'TBD',
          WORK_GUIDE: guidelines.guidelinesHtml || 'Guidelines coming soon...'
        };

        // Prepare tags
        const tags = [
          'Buyer-Workshops',
          `${guidelines.slug || lineItem.productId}-${new Date().toISOString().split('T')[0]}`
        ];

        // Upsert member in Mailchimp
        await withBackoff(() => 
          upsertMember({
            email: customerEmail,
            mergeFields,
            tags
          })
        );

        // Trigger campaign
        if (process.env.MC_CAMPAIGN_ID) {
          await withBackoff(() => 
            triggerCampaign({
              campaignId: process.env.MC_CAMPAIGN_ID,
              to: customerEmail,
              vars: mergeFields
            })
          );
        }

        // TODO: Mark as processed (implement idempotency)
        // await markAsProcessed(idempotencyKey);

        results.push({
          productId: lineItem.productId,
          status: 'success',
          guidelines: guidelines.name
        });

        console.log(`Successfully processed workshop ${lineItem.productId} for ${customerEmail}`);

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
