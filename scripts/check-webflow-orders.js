#!/usr/bin/env node
/**
 * Check Webflow Orders
 * Queries Webflow API to find recent orders, especially gift card orders
 */

require('dotenv').config();
const axios = require('axios');

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

function getWebflowClient() {
  const token = process.env.WEBFLOW_API_TOKEN;
  const siteId = process.env.WEBFLOW_SITE_ID;
  
  if (!token || !siteId) {
    throw new Error('WEBFLOW_API_TOKEN and WEBFLOW_SITE_ID environment variables are required');
  }

  return {
    client: axios.create({
      baseURL: WEBFLOW_API_BASE,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }),
    siteId
  };
}

async function getRecentOrders(limit = 50) {
  const { client, siteId } = getWebflowClient();
  
  try {
    // Webflow v2 API for orders
    const response = await client.get(`/sites/${siteId}/orders`, {
      params: {
        limit: limit
      }
    });
    
    return response.data.orders || [];
  } catch (error) {
    console.error('Error fetching orders:', error.response?.data || error.message);
    throw error;
  }
}

async function getOrderById(orderId) {
  const { client, siteId } = getWebflowClient();
  
  try {
    const response = await client.get(`/sites/${siteId}/orders/${orderId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching order ${orderId}:`, error.response?.data || error.message);
    throw error;
  }
}

function isGiftCardOrder(order) {
  if (!order.purchasedItems || !Array.isArray(order.purchasedItems)) {
    return false;
  }
  
  // Check if any item is a gift card
  const giftCardProductIds = [
    '692249f1d31c7799c916ba62', // $25
    '69224a5905f83c411c539e32', // $50
    '69224a9a9ff642a6c601e31f', // $75
    '69224ad55e493982669727ce', // $105
    '69224b080e6c6c565eb4ab7c'  // $210
  ];
  
  return order.purchasedItems.some(item => 
    giftCardProductIds.includes(item.productId)
  );
}

function formatOrder(order) {
  const customerEmail = order.customerInfo?.email || order.customer?.email || 'N/A';
  const orderId = order.orderId || order.id || 'N/A';
  const orderDate = order.acceptedOn || order.createdOn || 'N/A';
  
  const giftCardItems = order.purchasedItems?.filter(item => {
    const giftCardProductIds = [
      '692249f1d31c7799c916ba62', // $25
      '69224a5905f83c411c539e32', // $50
      '69224a9a9ff642a6c601e31f', // $75
      '69224ad55e493982669727ce', // $105
      '69224b080e6c6c565eb4ab7c'  // $210
    ];
    return giftCardProductIds.includes(item.productId);
  }) || [];
  
  return {
    orderId,
    customerEmail,
    orderDate,
    total: order.totals?.total || order.total || 'N/A',
    status: order.status || 'N/A',
    giftCardItems,
    isGiftCard: giftCardItems.length > 0
  };
}

async function findGiftCardOrders() {
  console.log('\n🔍 Fetching recent orders from Webflow...\n');
  
  try {
    const orders = await getRecentOrders(50);
    console.log(`✅ Found ${orders.length} recent order(s)\n`);
    
    const giftCardOrders = orders.filter(isGiftCardOrder);
    
    if (giftCardOrders.length === 0) {
      console.log('❌ No gift card orders found in recent orders.\n');
      console.log('Showing all recent orders:\n');
      orders.slice(0, 10).forEach(order => {
        const formatted = formatOrder(order);
        console.log(`📦 Order: ${formatted.orderId}`);
        console.log(`   Email: ${formatted.customerEmail}`);
        console.log(`   Date: ${formatted.orderDate}`);
        console.log(`   Total: ${formatted.total}`);
        console.log(`   Status: ${formatted.status}`);
        console.log('');
      });
      return [];
    }
    
    console.log(`🎁 Found ${giftCardOrders.length} gift card order(s):\n`);
    
    for (const order of giftCardOrders) {
      const formatted = formatOrder(order);
      console.log(`📦 Order ID: ${formatted.orderId}`);
      console.log(`   Customer: ${formatted.customerEmail}`);
      console.log(`   Date: ${formatted.orderDate}`);
      console.log(`   Total: ${formatted.total}`);
      console.log(`   Status: ${formatted.status}`);
      console.log(`   Gift Card Items:`);
      formatted.giftCardItems.forEach(item => {
        const quantity = item.count || item.quantity || 1;
        console.log(`      - ${item.productName || item.name || 'Gift Card'} (Qty: ${quantity})`);
        console.log(`        Product ID: ${item.productId}`);
      });
      console.log('');
    }
    
    return giftCardOrders;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.status === 401) {
      console.error('   Authentication failed. Check WEBFLOW_API_TOKEN.');
    } else if (error.response?.status === 404) {
      console.error('   Orders endpoint not found. Check WEBFLOW_SITE_ID.');
    }
    throw error;
  }
}

async function findSpecificOrder(orderId) {
  console.log(`\n🔍 Fetching order ${orderId} from Webflow...\n`);
  
  try {
    const order = await getOrderById(orderId);
    const formatted = formatOrder(order);
    
    console.log(`📦 Order Details:`);
    console.log(`   ID: ${formatted.orderId}`);
    console.log(`   Customer: ${formatted.customerEmail}`);
    console.log(`   Date: ${formatted.orderDate}`);
    console.log(`   Total: ${formatted.total}`);
    console.log(`   Status: ${formatted.status}`);
    console.log(`   Is Gift Card: ${formatted.isGiftCard ? '✅ Yes' : '❌ No'}`);
    
    if (formatted.giftCardItems.length > 0) {
      console.log(`\n   Gift Card Items:`);
      formatted.giftCardItems.forEach(item => {
        const quantity = item.count || item.quantity || 1;
        console.log(`      - ${item.productName || item.name || 'Gift Card'} (Qty: ${quantity})`);
        console.log(`        Product ID: ${item.productId}`);
      });
    }
    
    return order;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] !== '--all') {
    // Specific order ID
    await findSpecificOrder(args[0]);
  } else {
    // Find all gift card orders
    await findGiftCardOrders();
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

module.exports = { findGiftCardOrders, findSpecificOrder, getOrderById };

