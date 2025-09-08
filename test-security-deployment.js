#!/usr/bin/env node

/**
 * Security Deployment Test
 * Tests the webhook endpoint with the new security features
 */

require('dotenv').config();
const crypto = require('crypto');

async function testSecurityDeployment() {
  console.log('🔒 TESTING SECURITY DEPLOYMENT\n');
  
  const webhookUrl = 'https://katie-ann-clay-mailer.vercel.app/api/webflow/order';
  const webhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('❌ WEBFLOW_WEBHOOK_SECRET not found in environment');
    console.log('Please add WEBFLOW_WEBHOOK_SECRET to your .env file');
    return;
  }
  
  console.log(`🎯 Testing webhook: ${webhookUrl}`);
  console.log(`🔑 Using secret: ${webhookSecret.substring(0, 8)}...`);
  
  const results = [];
  
  // Test 1: Valid webhook with correct signature
  console.log('\n📋 TEST 1: Valid webhook with correct signature');
  const test1 = await testValidWebhook(webhookUrl, webhookSecret);
  results.push({ test: 'Valid webhook', passed: test1 });
  
  // Test 2: Invalid signature (should be rejected)
  console.log('\n📋 TEST 2: Invalid signature (should be rejected)');
  const test2 = await testInvalidSignature(webhookUrl);
  results.push({ test: 'Invalid signature', passed: test2 });
  
  // Test 3: Missing signature (should be rejected)
  console.log('\n📋 TEST 3: Missing signature (should be rejected)');
  const test3 = await testMissingSignature(webhookUrl);
  results.push({ test: 'Missing signature', passed: test3 });
  
  // Test 4: Invalid payload (should be rejected)
  console.log('\n📋 TEST 4: Invalid payload (should be rejected)');
  const test4 = await testInvalidPayload(webhookUrl, webhookSecret);
  results.push({ test: 'Invalid payload', passed: test4 });
  
  // Report results
  console.log('\n📊 TEST RESULTS:');
  console.log('================');
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.test}`);
  });
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\n📈 SUMMARY: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED - Security deployment is working correctly!');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review the issues above before deploying to production');
  }
}

function createWebhookSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function testValidWebhook(webhookUrl, secret) {
  const validPayload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": "test-security-12345",
      "status": "unfulfilled",
      "customerInfo": {
        "fullName": "Security Test Customer",
        "email": process.env.RESEND_FROM_EMAIL || "test@example.com"
      },
      "purchasedItems": [
        {
          "productId": "68b881f18b1125b45dbdd7b6",
          "productName": "Test Workshop",
          "quantity": 1
        }
      ]
    }
  };
  
  const signature = createWebhookSignature(validPayload, secret);
  
  try {
    const response = await makeRequest(webhookUrl, validPayload, signature);
    
    // ACTUALLY TEST: Check if response is 200 and has success: true
    if (response.status === 200) {
      if (response.data && response.data.success === true) {
        // ADDITIONAL VALIDATION: Check that results don't contain errors
        const hasErrors = response.data.results && response.data.results.some(result => 
          result.status === 'error' || result.error
        );
        
        if (hasErrors) {
          console.log('❌ Valid webhook returned success=true but contains processing errors');
          console.log(`   Order ID: ${response.data.orderId}`);
          console.log(`   Results: ${JSON.stringify(response.data.results, null, 2)}`);
          return false;
        }
        
        console.log('✅ Valid webhook accepted and processed successfully');
        console.log(`   Order ID: ${response.data.orderId}`);
        console.log(`   Results: ${JSON.stringify(response.data.results, null, 2)}`);
        return true;
      } else {
        console.log('❌ Valid webhook returned 200 but success=false');
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        return false;
      }
    } else {
      console.log('❌ Valid webhook was rejected');
      console.log(`   Status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing valid webhook:', error.message);
    return false;
  }
}

async function testInvalidSignature(webhookUrl) {
  const payload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": "test-invalid-sig",
      "customerInfo": { "email": "test@example.com" },
      "purchasedItems": [{ "productId": "test123" }]
    }
  };
  
  const invalidSignature = "invalid_signature_12345";
  
  try {
    const response = await makeRequest(webhookUrl, payload, invalidSignature);
    
    // ACTUALLY TEST: Check if we get 401 for invalid signature
    if (response.status === 401) {
      console.log('✅ Invalid signature correctly rejected (401)');
      return true;
    } else {
      console.log('❌ Invalid signature was not rejected - SECURITY ISSUE!');
      console.log(`   Expected: 401, Got: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing invalid signature:', error.message);
    return false;
  }
}

async function testMissingSignature(webhookUrl) {
  const payload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": "test-missing-sig",
      "customerInfo": { "email": "test@example.com" },
      "purchasedItems": [{ "productId": "test123" }]
    }
  };
  
  try {
    const response = await makeRequest(webhookUrl, payload, null);
    
    // ACTUALLY TEST: Check if we get 401 for missing signature
    if (response.status === 401) {
      console.log('✅ Missing signature correctly rejected (401)');
      return true;
    } else {
      console.log('❌ Missing signature was not rejected - SECURITY ISSUE!');
      console.log(`   Expected: 401, Got: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing missing signature:', error.message);
    return false;
  }
}

async function testInvalidPayload(webhookUrl, secret) {
  const invalidPayload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": "test-invalid-payload",
      // Missing customer email
      "purchasedItems": [] // Empty items
    }
  };
  
  const signature = createWebhookSignature(invalidPayload, secret);
  
  try {
    const response = await makeRequest(webhookUrl, invalidPayload, signature);
    
    // ACTUALLY TEST: Check if invalid payload is rejected (200 with success=false is OK)
    if (response.status === 200) {
      if (response.data && response.data.success === false) {
        console.log('✅ Invalid payload correctly rejected');
        console.log(`   Error: ${response.data.error}`);
        return true;
      } else {
        console.log('❌ Invalid payload was accepted - VALIDATION ISSUE!');
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        return false;
      }
    } else {
      console.log('❌ Invalid payload returned unexpected status');
      console.log(`   Status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing invalid payload:', error.message);
    return false;
  }
}

async function makeRequest(url, payload, signature) {
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
    options.headers['X-Webflow-Signature'] = signature;
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

// Run the tests
testSecurityDeployment().catch(console.error);
