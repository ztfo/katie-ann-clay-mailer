#!/usr/bin/env node
/**
 * Find Recent Gift Card Orders
 * Shows recent gift card orders and identifies ones that need attention
 */

require('dotenv').config();
const { getSupabaseClient } = require('../lib/supabase');

async function findRecentGiftCards(limit = 20) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('gift_card_codes')
    .select('*')
    .not('webflow_order_id', 'is', null)
    .order('assigned_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

async function findProblematicGiftCards() {
  const supabase = getSupabaseClient();
  
  // Find gift cards that are assigned but not sent
  const { data, error } = await supabase
    .from('gift_card_codes')
    .select('*')
    .eq('status', 'assigned')
    .is('sent_at', null)
    .order('assigned_at', { ascending: false });
  
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

async function main() {
  console.log('\n🔍 Finding Recent Gift Card Orders...\n');
  
  // First, check for problematic ones (assigned but not sent)
  console.log('⚠️  Gift Cards Assigned But Not Sent:\n');
  const problematic = await findProblematicGiftCards();
  
  if (problematic.length === 0) {
    console.log('✅ No problematic gift cards found!\n');
  } else {
    console.log(`Found ${problematic.length} gift card(s) that need attention:\n`);
    for (const giftCard of problematic) {
      const formatted = formatGiftCard(giftCard);
      console.log(`📦 Order: ${formatted.orderId}`);
      console.log(`   Code: ${formatted.code}`);
      console.log(`   Amount: ${formatted.amount}`);
      console.log(`   Purchaser: ${formatted.purchaserEmail}`);
      console.log(`   Assigned: ${formatted.assignedAt}`);
      console.log(`   Status: ${formatted.status} (email NOT sent)`);
      console.log(`\n   To resend: node scripts/diagnose-gift-card.js ${formatted.orderId} --resend\n`);
    }
  }
  
  // Then show recent ones
  console.log('📋 Recent Gift Card Orders (Last 20):\n');
  const recent = await findRecentGiftCards(20);
  
  if (recent.length === 0) {
    console.log('No gift card orders found.\n');
    return;
  }
  
  for (const giftCard of recent) {
    const formatted = formatGiftCard(giftCard);
    const statusIcon = formatted.status === 'sent' ? '✅' : formatted.status === 'assigned' ? '⚠️' : '❓';
    console.log(`${statusIcon} ${formatted.orderId} - ${formatted.amount} - ${formatted.status}`);
    console.log(`   Code: ${formatted.code}`);
    console.log(`   Email: ${formatted.purchaserEmail}`);
    console.log(`   Assigned: ${formatted.assignedAt || 'N/A'}`);
    console.log(`   Sent: ${formatted.sentAt || 'NOT SENT'}`);
    console.log('');
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

module.exports = { findRecentGiftCards, findProblematicGiftCards };

