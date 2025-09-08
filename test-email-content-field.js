#!/usr/bin/env node

/**
 * Test script to verify the Workshop Email Content field mapping
 */

const { resolveGuidelines } = require('./lib/webflow.js');
require('dotenv').config();

async function testEmailContentField() {
  console.log('🧪 Testing Workshop Email Content field mapping...\n');

  try {
    // Test with a workshop product
    const workshopProductId = '68b9ff6a8b58a455d7dc60b8';
    
    console.log(`Testing product: ${workshopProductId}`);
    console.log('Expected field priority: workshop-email-content → long-description → fallback\n');
    
    const guidelines = await resolveGuidelines(process.env.WEBFLOW_SITE_ID, {
      productId: workshopProductId
    });
    
    console.log('✅ Guidelines resolved successfully!');
    console.log(`Workshop name: ${guidelines.name}`);
    console.log(`Source: ${guidelines.source}`);
    console.log(`Content length: ${guidelines.guidelinesHtml ? guidelines.guidelinesHtml.length : 0} characters`);
    
    if (guidelines.guidelinesHtml) {
      console.log('\n📧 Email content preview (first 200 chars):');
      console.log(guidelines.guidelinesHtml.substring(0, 200) + '...');
    } else {
      console.log('\n⚠️  No email content found');
    }
    
  } catch (error) {
    console.error('❌ Error testing email content field:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testEmailContentField().catch(console.error);
}

module.exports = { testEmailContentField };
