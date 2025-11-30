#!/usr/bin/env node
/**
 * Diagnostic and Resend Tool for Gift Card Orders
 * Usage: 
 *   node scripts/diagnose-gift-card.js <orderId>
 *   node scripts/diagnose-gift-card.js --email <email>
 *   node scripts/diagnose-gift-card.js <orderId> --resend
 */

require('dotenv').config();
const { getSupabaseClient } = require('../lib/supabase');
const { sendGiftCardEmail } = require('../lib/resend');
const { getGiftCardProduct } = require('../lib/supabase');

async function findGiftCardByOrderId(orderId) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('gift_card_codes')
    .select('*')
    .eq('webflow_order_id', orderId)
    .order('assigned_at', { ascending: false });
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

async function findGiftCardByEmail(email) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('gift_card_codes')
    .select('*')
    .eq('purchaser_email', email)
    .order('assigned_at', { ascending: false })
    .limit(10);
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

function formatGiftCard(giftCard) {
  const amountDisplay = `$${(giftCard.amount_cents / 100).toFixed(2)}`;
  return {
    id: giftCard.id,
    code: giftCard.code,
    amount: amountDisplay,
    status: giftCard.status,
    orderId: giftCard.webflow_order_id,
    purchaserEmail: giftCard.purchaser_email,
    recipientEmail: giftCard.recipient_email,
    recipientName: giftCard.recipient_name,
    assignedAt: giftCard.assigned_at,
    sentAt: giftCard.sent_at,
    createdAt: giftCard.created_at
  };
}

async function resendGiftCardEmail(giftCard) {
  const amountDisplay = `$${(giftCard.amount_cents / 100).toFixed(2)}`;
  const recipientName = giftCard.recipient_name || giftCard.purchaser_email?.split('@')[0] || 'Friend';
  const shopUrl = process.env.SHOP_URL || 'https://www.katieannclay.com/shop-filters';
  
  console.log(`\n📧 Resending gift card email...`);
  console.log(`   To: ${giftCard.purchaser_email}`);
  console.log(`   Amount: ${amountDisplay}`);
  console.log(`   Code: ${giftCard.code}`);
  
  try {
    const result = await sendGiftCardEmail({
      to: giftCard.purchaser_email,
      recipientName,
      amountDisplay,
      code: giftCard.code,
      message: giftCard.message || null,
      shopUrl
    });
    
    console.log(`✅ Email sent successfully!`);
    console.log(`   Resend ID: ${result?.id || 'unknown'}`);
    
    // Update sent_at timestamp
    const supabase = getSupabaseClient();
    await supabase
      .from('gift_card_codes')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', giftCard.id);
    
    console.log(`✅ Database updated: status = 'sent'`);
    
    return result;
  } catch (error) {
    console.error(`❌ Error sending email:`, error.message);
    throw error;
  }
}

async function diagnoseOrder(orderId, resend = false) {
  console.log(`\n🔍 Diagnosing gift card order: ${orderId}\n`);
  
  const giftCards = await findGiftCardByOrderId(orderId);
  
  if (giftCards.length === 0) {
    console.log(`❌ No gift card codes found for order ${orderId}`);
    console.log(`\nPossible reasons:`);
    console.log(`  1. Order hasn't been processed yet`);
    console.log(`  2. Order ID doesn't match (check Webflow order ID format)`);
    console.log(`  3. Gift card processing failed during webhook`);
    console.log(`\n💡 Try searching by email instead:`);
    console.log(`   node scripts/diagnose-gift-card.js --email <email>`);
    return;
  }
  
  console.log(`✅ Found ${giftCards.length} gift card(s) for this order:\n`);
  
  for (const giftCard of giftCards) {
    const formatted = formatGiftCard(giftCard);
    console.log(`📦 Gift Card Details:`);
    console.log(`   ID: ${formatted.id}`);
    console.log(`   Code: ${formatted.code}`);
    console.log(`   Amount: ${formatted.amount}`);
    console.log(`   Status: ${formatted.status}`);
    console.log(`   Purchaser: ${formatted.purchaserEmail}`);
    if (formatted.recipientEmail) {
      console.log(`   Recipient: ${formatted.recipientEmail} (${formatted.recipientName})`);
    }
    console.log(`   Assigned: ${formatted.assignedAt || 'Not assigned'}`);
    console.log(`   Sent: ${formatted.sentAt || 'Not sent'}`);
    console.log(`   Created: ${formatted.createdAt}`);
    
    // Diagnose status
    if (formatted.status === 'unused') {
      console.log(`\n⚠️  Status is 'unused' - Code was never assigned to this order`);
    } else if (formatted.status === 'assigned' && !formatted.sentAt) {
      console.log(`\n⚠️  Status is 'assigned' but email was never sent`);
      console.log(`   This means the code was assigned but email sending failed`);
      if (resend) {
        await resendGiftCardEmail(giftCard);
      } else {
        console.log(`\n💡 To resend the email, run:`);
        console.log(`   node scripts/diagnose-gift-card.js ${orderId} --resend`);
      }
    } else if (formatted.status === 'sent' && formatted.sentAt) {
      console.log(`\n✅ Email was sent successfully at ${formatted.sentAt}`);
      if (resend) {
        console.log(`\n⚠️  Email was already sent, but resending anyway...`);
        await resendGiftCardEmail(giftCard);
      }
    }
    console.log(``);
  }
}

async function diagnoseByEmail(email, resend = false) {
  console.log(`\n🔍 Searching for gift cards by email: ${email}\n`);
  
  const giftCards = await findGiftCardByEmail(email);
  
  if (giftCards.length === 0) {
    console.log(`❌ No gift card codes found for email ${email}`);
    return;
  }
  
  console.log(`✅ Found ${giftCards.length} gift card(s) for this email:\n`);
  
  for (const giftCard of giftCards) {
    const formatted = formatGiftCard(giftCard);
    console.log(`📦 Gift Card:`);
    console.log(`   Order ID: ${formatted.orderId || 'N/A'}`);
    console.log(`   Code: ${formatted.code}`);
    console.log(`   Amount: ${formatted.amount}`);
    console.log(`   Status: ${formatted.status}`);
    console.log(`   Assigned: ${formatted.assignedAt || 'Not assigned'}`);
    console.log(`   Sent: ${formatted.sentAt || 'Not sent'}`);
    
    if (formatted.status === 'assigned' && !formatted.sentAt) {
      console.log(`   ⚠️  Email was never sent`);
      if (resend) {
        await resendGiftCardEmail(giftCard);
      }
    }
    console.log(``);
  }
  
  if (giftCards.length > 0 && !resend) {
    const unsent = giftCards.filter(gc => gc.status === 'assigned' && !gc.sent_at);
    if (unsent.length > 0) {
      console.log(`💡 To resend emails for unsent gift cards, run:`);
      console.log(`   node scripts/diagnose-gift-card.js --email ${email} --resend`);
    }
  }
}

async function listAllRecentOrders() {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('gift_card_codes')
    .select('*')
    .not('webflow_order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // If --list flag, show all recent orders
  if (args.includes('--list')) {
    console.log('\n📋 Recent Gift Card Orders:\n');
    const orders = await listAllRecentOrders();
    if (orders.length === 0) {
      console.log('No gift card orders found in database.\n');
      console.log('Possible reasons:');
      console.log('  1. Order hasn\'t been processed yet');
      console.log('  2. Webhook failed to process the order');
      console.log('  3. Order ID format doesn\'t match\n');
      return;
    }
    for (const order of orders) {
      const formatted = formatGiftCard(order);
      const statusIcon = formatted.status === 'sent' ? '✅' : formatted.status === 'assigned' ? '⚠️' : '❓';
      console.log(`${statusIcon} Order: ${formatted.orderId}`);
      console.log(`   Code: ${formatted.code}`);
      console.log(`   Amount: ${formatted.amount}`);
      console.log(`   Status: ${formatted.status}`);
      console.log(`   Email: ${formatted.purchaserEmail}`);
      console.log(`   Sent: ${formatted.sentAt || 'NOT SENT'}`);
      if (formatted.status === 'assigned' && !formatted.sentAt) {
        console.log(`   💡 Run: node scripts/diagnose-gift-card.js ${formatted.orderId} --resend`);
      }
      console.log('');
    }
    return;
  }
  
  if (args.length === 0) {
    console.error('❌ Error: No arguments provided\n');
    console.log('Usage:');
    console.log('  node scripts/diagnose-gift-card.js <orderId>');
    console.log('  node scripts/diagnose-gift-card.js <orderId> --resend');
    console.log('  node scripts/diagnose-gift-card.js --email <email>');
    console.log('  node scripts/diagnose-gift-card.js --email <email> --resend');
    console.log('  node scripts/diagnose-gift-card.js --list  (show all recent orders)');
    process.exit(1);
  }
  
  const resend = args.includes('--resend');
  const emailIndex = args.indexOf('--email');
  
  if (emailIndex !== -1) {
    const email = args[emailIndex + 1];
    if (!email) {
      console.error('❌ Error: --email requires an email address');
      process.exit(1);
    }
    await diagnoseByEmail(email, resend);
  } else {
    const orderId = args[0];
    if (!orderId || orderId.startsWith('--')) {
      console.error('❌ Error: Order ID is required');
      process.exit(1);
    }
    await diagnoseOrder(orderId, resend);
  }
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

module.exports = { diagnoseOrder, diagnoseByEmail, resendGiftCardEmail };

