#!/usr/bin/env node
/**
 * Manually Process Gift Card Order
 * Processes a gift card order that may have failed webhook processing
 */

require('dotenv').config();
const { getSupabaseClient, assignUnusedGiftCardCodeAtomically, markGiftCardSent, getGiftCardProduct } = require('../lib/supabase');
const { sendGiftCardEmail } = require('../lib/resend');
const { getProduct, isGiftCardProduct } = require('../lib/webflow');
const { withBackoff } = require('../lib/retry');

async function manuallyProcessOrder(orderId) {
  console.log(`\n🔧 Manually processing order: ${orderId}\n`);
  
  // First, check if already processed
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('gift_card_codes')
    .select('*')
    .eq('webflow_order_id', orderId);
  
  if (existing && existing.length > 0) {
    console.log(`⚠️  Order ${orderId} already has ${existing.length} gift card(s) assigned:`);
    existing.forEach(gc => {
      console.log(`   - Code: ${gc.code}`);
      console.log(`     Status: ${gc.status}`);
      console.log(`     Sent: ${gc.sent_at || 'NOT SENT'}`);
    });
    
    // Check if any need to be sent
    const unsent = existing.filter(gc => gc.status === 'assigned' && !gc.sent_at);
    if (unsent.length > 0) {
      console.log(`\n📧 Found ${unsent.length} gift card(s) that need email sent...`);
      for (const giftCard of unsent) {
        await sendGiftCardForCode(giftCard);
      }
      return;
    } else {
      console.log(`\n✅ All gift cards for this order have been sent.`);
      return;
    }
  }
  
  // Fetch order from Webflow
  console.log('📥 Fetching order details from Webflow...');
  const axios = require('axios');
  const client = axios.create({
    baseURL: 'https://api.webflow.com/v2',
    headers: {
      'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  let order;
  try {
    const response = await client.get(`/sites/${process.env.WEBFLOW_SITE_ID}/orders/${orderId}`);
    order = response.data;
  } catch (error) {
    console.error(`❌ Error fetching order: ${error.response?.data || error.message}`);
    throw error;
  }
  
  console.log(`✅ Order found:`);
  console.log(`   Customer: ${order.customerInfo?.email || order.customer?.email}`);
  console.log(`   Status: ${order.status}`);
  console.log(`   Items: ${order.purchasedItems?.length || 0}`);
  
  const customerEmail = order.customerInfo?.email || order.customer?.email;
  if (!customerEmail) {
    throw new Error('No customer email found in order');
  }
  
  const lineItems = order.purchasedItems || order.lineItems || [];
  if (lineItems.length === 0) {
    throw new Error('No items found in order');
  }
  
  // Process each line item
  for (const lineItem of lineItems) {
    const productId = lineItem.productId;
    console.log(`\n🔍 Processing item: ${productId}`);
    
    // Fetch product to check if it's a gift card
    const productResponse = await withBackoff(() => 
      getProduct(process.env.WEBFLOW_SITE_ID, productId)
    );
    
    const isGiftCard = isGiftCardProduct(productResponse.product);
    
    if (!isGiftCard) {
      console.log(`   ⏭️  Skipping - not a gift card product`);
      continue;
    }
    
    console.log(`   🎁 Gift card detected!`);
    
    // Get gift card product mapping
    const giftCardProduct = await getGiftCardProduct(productId);
    if (!giftCardProduct) {
      console.error(`   ❌ No gift card product mapping found for ${productId}`);
      continue;
    }
    
    const amountCents = giftCardProduct.amount_cents;
    const amountDisplay = `$${(amountCents / 100).toFixed(2)}`;
    const quantity = lineItem.count || lineItem.quantity || lineItem.qty || 1;
    
    console.log(`   💰 Amount: ${amountDisplay}`);
    console.log(`   📦 Quantity: ${quantity}`);
    
    // Process each quantity unit
    for (let i = 0; i < quantity; i++) {
      console.log(`\n   Processing gift card ${i + 1}/${quantity}...`);
      
      try {
        // Atomically assign code
        const giftCardCode = await withBackoff(() => 
          assignUnusedGiftCardCodeAtomically({
            amountCents,
            order: { orderId, id: orderId },
            purchaser: { email: customerEmail }
          })
        );
        
        console.log(`   ✅ Code assigned: ...${giftCardCode.code.slice(-4)}`);
        
        // Send email
        await sendGiftCardForCode(giftCardCode);
        
        console.log(`   ✅ Gift card ${i + 1}/${quantity} completed!`);
      } catch (error) {
        console.error(`   ❌ Error processing gift card ${i + 1}/${quantity}:`, error.message);
        throw error;
      }
    }
  }
  
  console.log(`\n✅ Order ${orderId} processed successfully!\n`);
}

async function sendGiftCardForCode(giftCardCode) {
  const amountDisplay = `$${(giftCardCode.amount_cents / 100).toFixed(2)}`;
  const recipientName = giftCardCode.recipient_name || giftCardCode.purchaser_email?.split('@')[0] || 'Friend';
  const shopUrl = process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters';
  
  console.log(`   📧 Sending email to ${giftCardCode.purchaser_email}...`);
  
  const emailResult = await withBackoff(() => 
    sendGiftCardEmail({
      to: giftCardCode.purchaser_email,
      recipientName,
      amountDisplay,
      code: giftCardCode.code,
      message: giftCardCode.message || null,
      shopUrl
    })
  );
  
  console.log(`   ✅ Email sent! (Resend ID: ${emailResult?.id || 'unknown'})`);
  
  // Mark as sent
  await withBackoff(() => 
    markGiftCardSent({ codeId: giftCardCode.id })
  );
  
  console.log(`   ✅ Database updated: status = 'sent'`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: Order ID required\n');
    console.log('Usage:');
    console.log('  node scripts/manually-process-order.js <orderId>');
    process.exit(1);
  }
  
  const orderId = args[0];
  await manuallyProcessOrder(orderId);
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { manuallyProcessOrder };

