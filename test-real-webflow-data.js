#!/usr/bin/env node

/**
 * Real Webflow Data Test
 * Fetches actual product data from your Webflow site and tests with real data
 */

require('dotenv').config();
const crypto = require('crypto');

async function testWithRealWebflowData() {
  console.log('🌐 TESTING WITH REAL WEBFLOW DATA\n');
  
  const webhookUrl = 'https://katie-ann-clay-mailer.vercel.app/api/webflow/order';
  const webhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('❌ WEBFLOW_WEBHOOK_SECRET not found in environment');
    process.exit(1);
  }
  
  // Check if we have the required environment variables
  if (!process.env.WEBFLOW_SITE_ID || !process.env.WEBFLOW_API_TOKEN) {
    console.error('❌ Missing Webflow environment variables');
    console.log('Please ensure WEBFLOW_SITE_ID and WEBFLOW_API_TOKEN are set');
    process.exit(1);
  }
  
  try {
    // Fetch real product data from Webflow
    console.log('📡 Fetching real product data from Webflow...');
    const webflow = require('./lib/webflow.js');
    const productResponse = await webflow.getProduct(process.env.WEBFLOW_SITE_ID, '68b881f18b1125b45dbdd7b6');
    
    if (!productResponse.product) {
      console.error('❌ Could not fetch product data from Webflow');
      console.log('Check your WEBFLOW_SITE_ID and WEBFLOW_API_TOKEN');
      process.exit(1);
    }
    
    const realProduct = productResponse.product;
    console.log(`✅ Fetched real product: ${realProduct.name}`);
    console.log(`   Product ID: ${realProduct.id}`);
    console.log(`   Price: $${realProduct.price}`);
    
    // Create realistic order payload with real product data
    const realOrderPayload = {
      "triggerType": "ecomm_new_order",
      "payload": {
        "orderId": `real-test-${Date.now()}`,
        "id": `real-test-${Date.now()}`,
        "status": "unfulfilled",
        "createdOn": new Date().toISOString(),
        "customer": {
          "email": "luis.palomares.e7@gmail.com",
          "name": "Real Data Test Customer",
          "firstName": "Real",
          "lastName": "Customer"
        },
        "customerInfo": {
          "email": "luis.palomares.e7@gmail.com",
          "fullName": "Real Data Test Customer"
        },
        "lineItems": [
          {
            "productId": realProduct.id,
            "name": realProduct.name,
            "quantity": 1,
            "price": realProduct.price
          }
        ],
        "purchasedItems": [
          {
            "productId": realProduct.id,
            "name": realProduct.name,
            "quantity": 1,
            "price": realProduct.price
          }
        ],
        "total": realProduct.price,
        "currency": "USD"
      }
    };
    
    const { signature, timestamp } = createWebhookSignature(realOrderPayload, webhookSecret);
    
    console.log('\n📋 SENDING REAL ORDER WITH ACTUAL WEBFLOW DATA...');
    console.log(`   Order ID: ${realOrderPayload.payload.orderId}`);
    console.log(`   Customer: ${realOrderPayload.payload.customer.email}`);
    console.log(`   Product: ${realProduct.name}`);
    console.log(`   Product ID: ${realProduct.id}`);
    console.log(`   Price: $${realProduct.price}`);
    
    const response = await makeRequest(webhookUrl, realOrderPayload, signature, timestamp);
    
    console.log('\n📊 RESPONSE ANALYSIS:');
    console.log('====================');
    console.log(`Status Code: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    
    // Validate response
    if (response.status === 200) {
      if (response.data && response.data.success === true) {
        // Check for processing errors
        const hasErrors = response.data.results && response.data.results.some(result => 
          result.status === 'error' || result.error
        );
        
        if (hasErrors) {
          console.log('\n❌ ORDER PROCESSING FAILED');
          console.log('   The webhook accepted the order but failed to process it');
          console.log('   This indicates a bug in the workshop email logic');
          process.exit(1);
        }
        
        // Check if email was actually sent
        const emailSent = response.data.results && response.data.results.some(result => 
          result.emailSent === true
        );
        
        if (!emailSent) {
          console.log('\n⚠️  ORDER PROCESSED BUT NO EMAIL SENT');
          console.log('   The order was processed but no workshop email was sent');
          console.log('   This might indicate the product is not recognized as a workshop');
          console.log('   Check if the product has the correct collection ID or workshop metadata');
        } else {
          console.log('\n✅ ORDER PROCESSED SUCCESSFULLY');
          console.log('   Workshop email was sent successfully');
          console.log('   This confirms the complete end-to-end flow is working');
        }
        
        console.log('\n🎉 REAL WEBFLOW DATA TEST PASSED');
        console.log('   The webhook successfully processed a real product from your Webflow site');
        process.exit(0);
        
      } else {
        console.log('\n❌ WEBHOOK REJECTED ORDER');
        console.log('   The webhook returned success=false');
        console.log('   Check the error message above');
        process.exit(1);
      }
    } else {
      console.log('\n❌ WEBHOOK RETURNED ERROR STATUS');
      console.log(`   Expected: 200, Got: ${response.status}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.log('\n❌ TEST FAILED');
    console.log(`   Error: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('   This might be an authentication issue with Webflow API');
      console.log('   Check your WEBFLOW_API_TOKEN');
    }
    process.exit(1);
  }
}

function createWebhookSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify(payload);
  const content = `${timestamp}:${rawBody}`;
  
  return {
    signature: crypto
      .createHmac('sha256', secret)
      .update(content)
      .digest('hex'),
    timestamp: timestamp
  };
}

async function makeRequest(url, payload, signature, timestamp) {
  const https = require('https');
  const postData = JSON.stringify(payload);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  if (signature) {
    options.headers['x-webflow-signature'] = signature;
  }
  
  if (timestamp) {
    options.headers['x-webflow-timestamp'] = timestamp;
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (parseError) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Run the test
testWithRealWebflowData();
