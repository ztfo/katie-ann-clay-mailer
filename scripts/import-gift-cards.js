#!/usr/bin/env node
/**
 * CSV Importer for Gift Card Codes
 * Usage: node scripts/import-gift-cards.js path/to/codes.csv
 */

require('dotenv').config();
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { importGiftCardCodes } = require('../lib/supabase');

/**
 * Validate CSV row data
 */
function validateRow(row, rowIndex) {
  const errors = [];

  // Validate required fields
  if (!row.code || row.code.trim() === '') {
    errors.push(`Row ${rowIndex}: 'code' is required`);
  }

  if (!row.amount_cents) {
    errors.push(`Row ${rowIndex}: 'amount_cents' is required`);
  } else {
    const amount = parseInt(row.amount_cents, 10);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowIndex}: 'amount_cents' must be a positive integer`);
    }
  }

  // Validate optional fields
  if (row.status && !['unused', 'assigned', 'sent', 'invalid'].includes(row.status)) {
    errors.push(`Row ${rowIndex}: 'status' must be one of: unused, assigned, sent, invalid`);
  }

  return errors;
}

/**
 * Parse CSV row to gift card code object
 */
function parseRow(row) {
  return {
    code: row.code.trim(),
    amount_cents: parseInt(row.amount_cents, 10),
    currency: row.currency ? row.currency.trim() : 'USD',
    status: row.status ? row.status.trim() : 'unused'
  };
}

/**
 * Main import function
 */
async function importGiftCards(csvFilePath) {
  console.log('🎁 Gift Card Code Importer\n');
  console.log(`Reading CSV file: ${csvFilePath}`);

  // Check if file exists
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ Error: File not found: ${csvFilePath}`);
    process.exit(1);
  }

  try {
    // Read and parse CSV file
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`📄 Found ${records.length} rows in CSV file\n`);

    if (records.length === 0) {
      console.log('⚠️  No records to import');
      return;
    }

    // Validate all rows
    console.log('✓ Validating records...');
    const allErrors = [];
    records.forEach((row, index) => {
      const errors = validateRow(row, index + 2); // +2 for header and 1-based indexing
      allErrors.push(...errors);
    });

    if (allErrors.length > 0) {
      console.error('\n❌ Validation errors found:');
      allErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log('✓ All records validated successfully\n');

    // Parse rows
    const codes = records.map(parseRow);

    // Group by denomination for display
    const grouped = codes.reduce((acc, code) => {
      const key = `$${(code.amount_cents / 100).toFixed(2)}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log('📊 Import summary:');
    Object.entries(grouped).forEach(([amount, count]) => {
      console.log(`  ${amount}: ${count} codes`);
    });
    console.log('');

    // Import to Supabase
    console.log('⬆️  Importing to Supabase...');
    const result = await importGiftCardCodes(codes);

    // Display results
    console.log('\n✅ Import completed successfully!');
    console.log(`📈 Statistics:`);
    console.log(`  - Total codes imported: ${result.imported}`);
    console.log(`  - Status: ${result.success ? 'Success' : 'Failed'}`);
    console.log('');
    console.log('🎉 Done! Your gift card codes are ready to use.');

  } catch (error) {
    if (error.code === '23505') {
      // Unique constraint violation
      console.error('\n❌ Error: Duplicate code detected');
      console.error('   Some codes already exist in the database.');
      console.error('   Please check your CSV file for duplicates or codes that have already been imported.');
    } else {
      console.error('\n❌ Import failed:', error.message);
      if (error.details) {
        console.error('   Details:', error.details);
      }
    }
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: No CSV file specified\n');
    console.log('Usage: node scripts/import-gift-cards.js path/to/codes.csv');
    console.log('');
    console.log('CSV format:');
    console.log('  code,amount_cents,currency,status');
    console.log('  GIFT25-ABC123,2500,USD,unused');
    console.log('  GIFT50-XYZ789,5000,USD,unused');
    console.log('');
    console.log('Required columns: code, amount_cents');
    console.log('Optional columns: currency (default: USD), status (default: unused)');
    process.exit(1);
  }

  const csvFilePath = args[0];
  importGiftCards(csvFilePath);
}

module.exports = { importGiftCards, validateRow, parseRow };

