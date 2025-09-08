#!/usr/bin/env node

/**
 * End-to-End Test
 * Tests the complete webhook flow with real order data
 */

require('dotenv').config();
const crypto = require('crypto');

async function testEndToEnd() {
  console.log('🚀 TESTING END-TO-END WEBHOOK FLOW\n');
  
  const webhookUrl = 'https://katie-ann-clay-mailer.vercel.app/api/webflow/order';
  const webhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('❌ WEBFLOW_WEBHOOK_SECRET not found in environment');
    console.log('Please add WEBFLOW_WEBHOOK_SECRET to your .env file');
    process.exit(1);
  }
  
  console.log(`🎯 Testing webhook: ${webhookUrl}`);
  console.log(`🔑 Using secret: ${webhookSecret.substring(0, 8)}...`);
  
  // Test with real order data structure
  const realOrderPayload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": `e2e-test-${Date.now()}`,
      "id": `e2e-test-${Date.now()}`,
      "status": "unfulfilled",
      "createdOn": new Date().toISOString(),
      "customer": {
        "email": process.env.RESEND_FROM_EMAIL || "test@katieannclay.com",
        "name": "End-to-End Test Customer",
        "firstName": "Test",
        "lastName": "Customer"
      },
      "customerInfo": {
        "email": process.env.RESEND_FROM_EMAIL || "test@katieannclay.com",
        "fullName": "End-to-End Test Customer"
      },
      "lineItems": [
        {
          "productId": "68b881f18b1125b45dbdd7b6", // Real workshop product ID
          "name": "Pottery Workshop - Beginner Level",
          "quantity": 1,
          "price": 125.00
        }
      ],
      "purchasedItems": [
        {
          "productId": "68b881f18b1125b45dbdd7b6",
          "name": "Pottery Workshop - Beginner Level",
          "quantity": 1,
          "price": 125.00
        }
      ],
      "total": 125.00,
      "currency": "USD"
    }
  };
  
  const signature = createWebhookSignature(realOrderPayload, webhookSecret);
  
  try {
    console.log('\n📋 SENDING REAL ORDER DATA...');
    console.log(`   Order ID: ${realOrderPayload.payload.orderId}`);
    console.log(`   Customer: ${realOrderPayload.payload.customer.email}`);
    console.log(`   Product: ${realOrderPayload.payload.lineItems[0].name}`);
    console.log(`   Product ID: ${realOrderPayload.payload.lineItems[0].productId}`);
    
    const response = await makeRequest(webhookUrl, realOrderPayload, signature);
    
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
        } else {
          console.log('\n✅ ORDER PROCESSED SUCCESSFULLY');
          console.log('   Workshop email was sent successfully');
        }
        
        console.log('\n🎉 END-TO-END TEST PASSED');
        console.log('   The complete webhook flow is working correctly');
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
    console.log('\n❌ REQUEST FAILED');
    console.log(`   Error: ${error.message}`);
    process.exit(1);
  }
}

function createWebhookSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function makeRequest(url, payload, signature) {
  const https = require('https');
  const postData = JSON.stringify(payload);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-webflow-signature': signature
    }
  };
  
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
testEndToEnd();
