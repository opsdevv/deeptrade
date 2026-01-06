/**
 * Script to check and fix instrument symbols in Supabase
 * 
 * Usage:
 *   npx tsx scripts/fix-instruments.ts [--fix]
 * 
 * Without --fix: Dry run (only shows what would be changed)
 * With --fix: Actually updates the symbols in the database
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeSymbol } from '../lib/api/deriv';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing environment variables:');
  if (!supabaseUrl) console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('\nPlease set these in your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAndFixInstruments(fix: boolean = false) {
  console.log(`\n🔍 ${fix ? 'Fixing' : 'Checking'} instrument symbols in Supabase...\n`);

  // Get all instruments
  const { data: instruments, error: fetchError } = await supabase
    .from('instruments')
    .select('id, symbol, type, created_at')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Failed to fetch instruments:', fetchError.message);
    process.exit(1);
  }

  if (!instruments || instruments.length === 0) {
    console.log('✅ No instruments found in database');
    return;
  }

  console.log(`📊 Found ${instruments.length} instruments\n`);

  const issues: Array<{
    id: string;
    current: string;
    corrected: string;
    type: string;
  }> = [];
  const correct: Array<{
    id: string;
    symbol: string;
    type: string;
  }> = [];

  // Check each instrument
  for (const instrument of instruments) {
    const currentSymbol = instrument.symbol;
    const normalizedSymbol = normalizeSymbol(currentSymbol);
    
    if (currentSymbol !== normalizedSymbol) {
      issues.push({
        id: instrument.id,
        current: currentSymbol,
        corrected: normalizedSymbol,
        type: instrument.type || 'unknown',
      });
    } else {
      correct.push({
        id: instrument.id,
        symbol: currentSymbol,
        type: instrument.type || 'unknown',
      });
    }
  }

  // Display results
  console.log(`✅ Correct symbols: ${correct.length}`);
  console.log(`⚠️  Symbols needing fix: ${issues.length}\n`);

  if (issues.length > 0) {
    console.log('📋 Symbols that need fixing:');
    console.log('─'.repeat(80));
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.current.padEnd(20)} → ${issue.corrected.padEnd(20)} (${issue.type})`);
    });
    console.log('─'.repeat(80));

    if (fix) {
      console.log('\n🔧 Fixing symbols...\n');
      let fixedCount = 0;
      let skippedCount = 0;

      for (const issue of issues) {
        // Check if the corrected symbol already exists
        const { data: existing } = await supabase
          .from('instruments')
          .select('id')
          .eq('symbol', issue.corrected)
          .neq('id', issue.id)
          .single();

        if (existing) {
          console.log(`⚠️  Skipping ${issue.current} → ${issue.corrected} (symbol already exists)`);
          skippedCount++;
          continue;
        }

        // Update the symbol
        const { error: updateError } = await supabase
          .from('instruments')
          .update({ symbol: issue.corrected })
          .eq('id', issue.id);

        if (updateError) {
          console.error(`❌ Failed to update ${issue.current}:`, updateError.message);
        } else {
          console.log(`✅ Fixed: ${issue.current} → ${issue.corrected}`);
          fixedCount++;
        }
      }

      console.log(`\n📊 Summary:`);
      console.log(`   Fixed: ${fixedCount}`);
      console.log(`   Skipped: ${skippedCount}`);
      console.log(`   Failed: ${issues.length - fixedCount - skippedCount}`);
    } else {
      console.log('\n💡 To actually fix these symbols, run:');
      console.log('   npx tsx scripts/fix-instruments.ts --fix\n');
    }
  } else {
    console.log('✅ All instrument symbols are already in the correct format!\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

checkAndFixInstruments(shouldFix)
  .then(() => {
    console.log('✨ Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
