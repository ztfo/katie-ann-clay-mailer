#!/usr/bin/env node
/**
 * Check Database Setup
 * Verifies that all required database functions and tables exist
 */

require('dotenv').config();
const { getSupabaseClient } = require('../lib/supabase');

async function checkDatabaseSetup() {
  const supabase = getSupabaseClient();
  
  console.log('\n🔍 Checking Database Setup...\n');
  
  // Check if gift_card_codes table exists and has data
  console.log('1. Checking gift_card_codes table...');
  const { data: codes, error: codesError } = await supabase
    .from('gift_card_codes')
    .select('id, code, status, amount_cents')
    .limit(5);
  
  if (codesError) {
    console.log(`   ❌ Error: ${codesError.message}`);
    if (codesError.message.includes('relation') || codesError.message.includes('does not exist')) {
      console.log('   ⚠️  Table might not exist. Run migrations first.');
    }
  } else {
    console.log(`   ✅ Table exists`);
    console.log(`   📊 Total sample: ${codes?.length || 0} codes (showing first 5)`);
    if (codes && codes.length > 0) {
      const statusCounts = codes.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      }, {});
      console.log(`   📈 Status breakdown:`, statusCounts);
    }
  }
  
  // Check if gift_card_products table exists
  console.log('\n2. Checking gift_card_products table...');
  const { data: products, error: productsError } = await supabase
    .from('gift_card_products')
    .select('*');
  
  if (productsError) {
    console.log(`   ❌ Error: ${productsError.message}`);
  } else {
    console.log(`   ✅ Table exists`);
    console.log(`   📊 Products configured: ${products?.length || 0}`);
    if (products && products.length > 0) {
      products.forEach(p => {
        console.log(`      - $${(p.amount_cents / 100).toFixed(2)}: ${p.webflow_product_id} (${p.active ? 'active' : 'inactive'})`);
      });
    }
  }
  
  // Check if atomic assignment function exists
  console.log('\n3. Checking atomic assignment function...');
  try {
    // Try to call the function with invalid params to see if it exists
    const { error: funcError } = await supabase.rpc('assign_unused_gift_card_code', {
      p_amount_cents: 999999,
      p_webflow_order_id: 'test',
      p_purchaser_email: 'test@test.com'
    });
    
    if (funcError) {
      if (funcError.message.includes('does not exist') || funcError.message.includes('function')) {
        console.log(`   ❌ Function does not exist!`);
        console.log(`   ⚠️  You need to run migration: migrations/005_atomic_gift_card_assignment.sql`);
        console.log(`   📝 This is likely why gift card orders are failing!`);
      } else if (funcError.message.includes('No unused gift card codes')) {
        console.log(`   ✅ Function exists and works!`);
        console.log(`   ℹ️  (Expected error: no codes for test amount)`);
      } else {
        console.log(`   ⚠️  Function exists but error: ${funcError.message}`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Error checking function: ${err.message}`);
  }
  
  // Check for any assigned but not sent codes
  console.log('\n4. Checking for problematic gift cards...');
  const { data: problematic, error: probError } = await supabase
    .from('gift_card_codes')
    .select('*')
    .eq('status', 'assigned')
    .is('sent_at', null);
  
  if (probError) {
    console.log(`   ⚠️  Error: ${probError.message}`);
  } else {
    console.log(`   📊 Found ${problematic?.length || 0} gift card(s) assigned but not sent`);
    if (problematic && problematic.length > 0) {
      console.log(`   ⚠️  These need attention:`);
      problematic.forEach(gc => {
        console.log(`      - Order: ${gc.webflow_order_id || 'N/A'}`);
        console.log(`        Code: ${gc.code}`);
        console.log(`        Email: ${gc.purchaser_email}`);
        console.log(`        Assigned: ${gc.assigned_at}`);
        console.log(`        Run: node scripts/diagnose-gift-card.js ${gc.webflow_order_id} --resend`);
        console.log('');
      });
    }
  }
  
  console.log('\n✅ Database check complete!\n');
}

if (require.main === module) {
  checkDatabaseSetup().catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { checkDatabaseSetup };

