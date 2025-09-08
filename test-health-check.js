#!/usr/bin/env node

/**
 * Health Check Test
 * Tests the basic health endpoint
 */

async function testHealthCheck() {
  console.log('🏥 TESTING HEALTH CHECK\n');
  
  const healthUrl = 'https://katie-ann-clay-mailer.vercel.app/api/health';
  const timeout = 10000; // 10 second timeout
  
  try {
    const https = require('https');
    
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        const req = https.request(healthUrl, { method: 'GET' }, (res) => {
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
        
        req.end();
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      })
    ]);
    
    // ACTUALLY TEST: Check if we get 200 and service is running
    if (response.status === 200) {
      if (response.data && response.data.ok === true) {
        // Validate all required fields
        const requiredFields = ['ok', 'service', 'timestamp', 'signature'];
        const missingFields = requiredFields.filter(field => !(field in response.data));
        
        if (missingFields.length > 0) {
          console.log('❌ Health check missing required fields:', missingFields.join(', '));
          console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
          console.log('\n💥 TEST FAILED - Missing required fields');
          process.exit(1);
        }
        
        console.log('✅ Health check passed');
        console.log(`   Service: ${response.data.service}`);
        console.log(`   Timestamp: ${response.data.timestamp}`);
        console.log(`   Signature: ${response.data.signature ? 'Present' : 'Missing'}`);
        console.log('\n🎉 ALL HEALTH CHECKS PASSED');
        process.exit(0);
      } else {
        console.log('❌ Health check returned 200 but service not OK');
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        console.log('\n💥 TEST FAILED - Service not OK');
        process.exit(1);
      }
    } else {
      console.log('❌ Health check failed');
      console.log(`   Expected: 200, Got: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      console.log('\n💥 TEST FAILED - Wrong status code');
      process.exit(1);
    }
  } catch (error) {
    if (error.message === 'Request timeout') {
      console.log('❌ Health check timed out after 10 seconds');
    } else {
      console.log('❌ Error testing health check:', error.message);
    }
    console.log('\n💥 TEST FAILED - Request error');
    process.exit(1);
  }
}

testHealthCheck();
