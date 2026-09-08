#!/usr/bin/env node
/**
 * Script to run Meta Ads historical backfill
 * Usage: node scripts/run-meta-ads-backfill.js
 * 
 * This script calls the sync-meta-ads Edge Function for each missing date
 * to backfill historical data.
 */

const SUPABASE_PROJECT_ID = 'qzesffnkqgelmtfblzkr';
const SUPABASE_ANON_KEY = 'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY';
const EDGE_FUNCTION_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/sync-meta-ads`;

// Date range for backfill
const START_DATE = '2025-09-01';
const END_DATE = '2026-02-25';

// Rate limiting: delay between requests (ms)
const DELAY_BETWEEN_REQUESTS = 6000; // 6 seconds to respect Meta API rate limits

/**
 * Generate array of dates between start and end (inclusive)
 */
function generateDateRange(start, end) {
  const dates = [];
  const current = new Date(start);
  const endDate = new Date(end);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call the sync-meta-ads Edge Function for a specific date
 */
async function syncDate(date) {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ specific_date: date }),
  });
  
  const data = await response.json();
  
  return {
    date,
    success: response.ok && data.success,
    recordsFetched: data.records_fetched || 0,
    recordsInserted: data.records_inserted || 0,
    error: data.error || null,
    executionTimeMs: data.execution_time_ms || 0,
  };
}

/**
 * Main backfill function
 */
async function runBackfill() {
  console.log('========================================');
  console.log('🚀 Meta Ads Historical Backfill');
  console.log('========================================');
  console.log(`Project: ${SUPABASE_PROJECT_ID}`);
  console.log(`Date range: ${START_DATE} to ${END_DATE}`);
  console.log('');
  
  const dates = generateDateRange(START_DATE, END_DATE);
  const totalDates = dates.length;
  
  console.log(`Total dates to process: ${totalDates}`);
  console.log(`Estimated time: ${Math.round(totalDates * 6 / 60)} minutes`);
  console.log('');
  
  const results = {
    successful: 0,
    failed: 0,
    skipped: 0,
    totalRecords: 0,
    errors: [],
  };
  
  const startTime = Date.now();
  
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const progress = `[${i + 1}/${totalDates}]`;
    
    process.stdout.write(`${progress} Processing ${date}... `);
    
    try {
      const result = await syncDate(date);
      
      if (result.success) {
        if (result.recordsFetched === 0) {
          results.skipped++;
          console.log(`⏭️  No data (skipped)`);
        } else {
          results.successful++;
          results.totalRecords += result.recordsInserted;
          console.log(`✅ ${result.recordsInserted} records inserted`);
        }
      } else {
        results.failed++;
        results.errors.push({ date, error: result.error });
        console.log(`❌ Error: ${result.error}`);
      }
      
      // Rate limiting
      if (i < dates.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS);
      }
      
    } catch (error) {
      results.failed++;
      results.errors.push({ date, error: error.message });
      console.log(`❌ Exception: ${error.message}`);
    }
  }
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  
  console.log('');
  console.log('========================================');
  console.log('📊 Backfill Summary');
  console.log('========================================');
  console.log(`Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`Successful: ${results.successful}`);
  console.log(`Skipped (no data): ${results.skipped}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total records inserted: ${results.totalRecords}`);
  
  if (results.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    results.errors.forEach(({ date, error }) => {
      console.log(`  - ${date}: ${error}`);
    });
  }
  
  console.log('');
  console.log('✅ Backfill completed!');
  
  return results;
}

// Run the backfill
runBackfill().catch(console.error);
