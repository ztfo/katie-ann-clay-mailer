#!/usr/bin/env node

/**
 * Final webhook test with real Webflow payload structure
 * Tests the exact payload format we saw in the logs
 */

require('dotenv').config();

async function testFinalWebhook() {
  console.log('🔍 FINAL WEBHOOK TEST WITH REAL WEBFLOW PAYLOAD\n');
  
  const webhookUrl = 'https://katie-ann-clay-mailer.vercel.app/api/webflow/order';
  
  // Use the EXACT payload structure from your real order logs
  const realWebflowPayload = {
    "triggerType": "ecomm_new_order",
    "payload": {
      "orderId": "test-final-12345",
      "status": "unfulfilled",
      "comment": "",
      "orderComment": "",
      "acceptedOn": new Date().toISOString(),
      "disputedOn": null,
      "disputeUpdatedOn": null,
      "disputeLastStatus": null,
      "fulfilledOn": null,
      "refundedOn": null,
      "customerPaid": {
        "unit": "USD",
        "value": 11500,
        "string": "$ 115 "
      },
      "netAmount": {
        "unit": "USD",
        "value": 10900,
        "string": "$ 109.00 "
      },
      "applicationFee": {
        "value": 600,
        "unit": "USD"
      },
      "shippingProvider": null,
      "shippingTracking": null,
      "shippingTrackingURL": null,
      "customerInfo": {
        "fullName": "Test Customer",
        "email": process.env.RESEND_FROM_EMAIL // Use your email for testing
      },
      "allAddresses": [
        {
          "type": "billing",
          "addressee": "Test Customer",
          "line1": "123 Test St",
          "line2": "",
          "city": "Austin",
          "state": "TX",
          "country": "US",
          "postalCode": "78701"
        }
      ],
      "billingAddress": {
        "type": "billing",
        "addressee": "Test Customer",
        "line1": "123 Test St",
        "line2": "",
        "city": "Austin",
        "state": "TX",
        "country": "US",
        "postalCode": "78701"
      },
      "purchasedItems": [
        {
          "count": 1,
          "rowTotal": {
            "unit": "USD",
            "value": 11500,
            "string": "$ 115 "
          },
          "productId": "68b881f18b1125b45dbdd7b6", // Real workshop product
          "productName": "Earth + Stone Adornments: A Jewelry Workshop",
          "productSlug": "earth-stone-adornments-a-jewelry-workshop",
          "variantId": "68b881f1aa04df59e5fde6ad",
          "variantName": "Earth + Stone Adornments: A Jewelry Workshop",
          "variantSlug": "earth-stone-adornments-a-jewelry-workshop",
          "variantSKU": null,
          "variantImage": {
            "fileId": "68b881d39d1bdc4d5fb2dcdb",
            "url": "https://cdn.prod.website-files.com/5e4c9d2ee19c92a5f08b2b10/68b881d39d1bdc4d5fb2dcdb_katieannclay-2%20resize%201500.jpg",
            "alt": null,
            "file": null
          },
          "variantPrice": {
            "unit": "USD",
            "value": 11500,
            "string": "$ 115 "
          },
          "weight": 0,
          "height": 0,
          "width": 0,
          "length": 0
        }
      ],
      "purchasedItemsCount": 1,
      "totals": {
        "subtotal": {
          "unit": "USD",
          "value": 11500,
          "string": "$ 115 "
        },
        "extras": [
          {
            "type": "tax",
            "name": "State Taxes",
            "description": "TX Taxes (6.25%)",
            "price": {
              "unit": "USD",
              "value": 719,
              "string": "$ 7.19 "
            }
          }
        ],
        "total": {
          "unit": "USD",
          "value": 12219,
          "string": "$ 122.19 "
        }
      },
      "customData": [],
      "paypalDetails": null,
      "stripeCard": {
        "last4": "1234",
        "brand": "Visa",
        "ownerName": "Test Customer",
        "expires": {
          "month": 12,
          "year": 2025
        }
      },
      "stripeDetails": {
        "customerId": "cus_test123",
        "paymentMethod": "pm_test123",
        "chargeId": "ch_test123",
        "disputeId": null,
        "paymentIntentId": "pi_test123",
        "subscriptionId": null,
        "refundId": null,
        "refundReason": null
      },
      "paymentProcessor": "stripe",
      "hasDownloads": false,
      "downloadFiles": [],
      "metadata": {
        "isBuyNow": false
      },
      "isCustomerDeleted": false,
      "isShippingRequired": false
    }
  };
  
  try {
    console.log('📤 Sending webhook test...');
    console.log(`🎯 Target: ${webhookUrl}`);
    console.log(`📦 Product: ${realWebflowPayload.payload.purchasedItems[0].productName}`);
    console.log(`📧 Email: ${realWebflowPayload.payload.customerInfo.email}`);
    
    const https = require('https');
    const postData = JSON.stringify(realWebflowPayload);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Webflow-Signature': 'test-signature'
      }
    };
    
    await new Promise((resolve, reject) => {
      const req = https.request(webhookUrl, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('\n📥 WEBHOOK RESPONSE:');
            console.log(`Status: ${res.statusCode}`);
            console.log(`Success: ${response.success}`);
            console.log(`Order ID: ${response.orderId}`);
            console.log(`Customer Email: ${response.customerEmail}`);
            console.log(`Results: ${JSON.stringify(response.results, null, 2)}`);
            
            if (res.statusCode === 200 && response.success) {
              console.log('\n✅ WEBHOOK TEST SUCCESSFUL!');
              console.log('🎯 Your system is ready for real orders!');
              
              if (response.results && response.results.length > 0) {
                const result = response.results[0];
                if (result.status === 'success' && result.emailSent) {
                  console.log('📧 Email was sent successfully!');
                  console.log(`📝 Workshop: ${result.workshopName}`);
                } else {
                  console.log('⚠️  Email sending had issues:', result);
                }
              }
            } else {
              console.log('\n❌ WEBHOOK TEST FAILED!');
              console.log('Response:', response);
            }
            
            resolve();
          } catch (parseError) {
            console.error('❌ Error parsing response:', parseError);
            console.log('Raw response:', data);
            reject(parseError);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('❌ Request error:', error);
        reject(error);
      });
      
      req.write(postData);
      req.end();
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFinalWebhook();
