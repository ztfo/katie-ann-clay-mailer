#!/usr/bin/env node

/**
 * Disable Debug Logging Script
 * Sets DEBUG_LOGGING=false in Vercel environment
 */

const { execSync } = require('child_process');

console.log('🔇 Disabling debug logging in production...');

try {
  // Set DEBUG_LOGGING to false in Vercel
  execSync('vercel env add DEBUG_LOGGING production', {
    stdio: 'inherit',
    input: 'false\n'
  });
  
  console.log('✅ Debug logging disabled in production');
  console.log('📝 To re-enable for testing, run: vercel env add DEBUG_LOGGING production');
  console.log('   Then enter "true" when prompted');
  
} catch (error) {
  console.error('❌ Failed to disable debug logging:', error.message);
  console.log('💡 You can manually set DEBUG_LOGGING=false in your Vercel dashboard');
}
