#!/usr/bin/env node

/**
 * Test Live Webhook Endpoint
 * Simulates a real Webflow order webhook
 */

const https = require('https');

async function testWebhook() {
  console.log('🌐 Testing Live Webhook Endpoint...\n');
  
  const webhookUrl = 'https://katie-ann-clay-mailer.vercel.app/api/webflow/order';
  
  const payload = {
    name: 'Order Created',
    id: 'test-order-' + Date.now(),
    createdOn: new Date().toISOString(),
    updatedOn: new Date().toISOString(),
    archived: false,
    test: true,
    orderNumber: Math.floor(Math.random() * 10000),
    customer: {
      email: process.env.RESEND_FROM_EMAIL,
      fullName: 'Test Customer',
      phone: '+1234567890'
    },
    shippingAddress: {
      name: 'Test Customer',
      street: '123 Test St',
      city: 'Test City',
      state: 'CA',
      zipCode: '90210',
      country: 'US'
    },
    billingAddress: {
      name: 'Test Customer',
      street: '123 Test St',
      city: 'Test City',
      state: 'CA',
      zipCode: '90210',
      country: 'US'
    },
    lineItems: [
      {
        id: 'test-line-item-1',
        productId: '68b9ff6a8b58a455d7dc60b8', // Real workshop product
        variantId: 'test-variant-1',
        quantity: 1,
        price: {
          unit: 150.00,
          total: 150.00
        },
        product: {
          id: '68b9ff6a8b58a455d7dc60b8',
          name: 'Red Mica Altars at Cosmic Plant Co.',
          slug: 'red-mica-altars-at-cosmic-plant-co',
          fieldData: {
            name: 'Red Mica Altars at Cosmic Plant Co.',
            slug: 'red-mica-altars-at-cosmic-plant-co',
            category: ['66e8d658ede37e2f7706b996'],
            'ec-product-type': 'c599e43b1a1c34d5a323aedf75d3adf6',
            'workshop-email-content': '<h3>Welcome to your Red Mica Altars Workshop!</h3><p>We are excited to have you join us for this hands-on clay experience at Cosmic Plant Co.</p><h4>Workshop Details:</h4><p><strong>Date:</strong> Saturday, October 25th</p><p><strong>Time:</strong> 2:00pm - 4:30pm</p><p><strong>Location:</strong> Cosmic Plant Co. (behind Black Swan Antiques)</p><p><strong>Address:</strong> 1640 Hunter Rd, New Braunfels, TX 78130</p><h4>What to Expect:</h4><p>In this 2.5-hour workshop, we will explore the shimmering, textured beauty of micaceous clay from Northern New Mexico. I will guide you through the process to create a unique altar/wall hanging. Perfect for holding a candle, precious things, or just to display on its own.</p><p>Dive into your creative flow under an ancient oak surrounded by the plants of Cosmic Plant Co. Make a full day of it by exploring the historic town of Gruene, TX and check out the Texas Clay Festival happening the same day!</p><h4>What to Bring:</h4><ul><li>Dress comfortably and be ready to get your hands dirty—in the best way</li><li>Short nails recommended for a more enjoyable experience</li><li>Enthusiasm to create!</li></ul><p>Pieces will be fired and left unglazed - allowing the beautiful mica to sparkle through (which turns gold after firing!) Your finished work will be ready for pick-up in 5-6 weeks.</p>'
          }
        }
      }
    ],
    subtotal: {
      unit: 150.00,
      total: 150.00
    },
    total: {
      unit: 150.00,
      total: 150.00
    },
    currency: 'USD',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'paid'
  };

  const postData = JSON.stringify(payload);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'X-Webflow-Signature': 'test-signature'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(webhookUrl, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`📡 Webhook Response (${res.statusCode}):`);
        console.log(JSON.stringify(JSON.parse(data), null, 2));
        
        if (res.statusCode === 200) {
          console.log('\n✅ Webhook test successful!');
          console.log('📧 Check your inbox for the workshop email');
        } else {
          console.log('\n❌ Webhook test failed');
        }
        
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Webhook request failed:', error.message);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Run the test
require('dotenv').config();
testWebhook().catch(console.error);
