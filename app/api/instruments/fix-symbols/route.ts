// API Route: /api/instruments/fix-symbols - Check and fix instrument symbols to use proper Deriv format

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { normalizeSymbol } from '@/lib/api/deriv';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    
    // Get all instruments from Supabase
    const { data: instruments, error: fetchError } = await supabase
      .from('instruments')
      .select('id, symbol, type')
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch instruments: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!instruments || instruments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No instruments found in database',
        checked: 0,
        fixed: 0,
        issues: [],
      });
    }

    const issues: Array<{
      id: string;
      current: string;
      corrected: string;
      type: string;
    }> = [];
    const fixed: Array<{
      id: string;
      old: string;
      new: string;
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
      }
    }

    // Ask for confirmation if in dry-run mode, or fix directly
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run unless explicitly set to false

    if (!dryRun && issues.length > 0) {
      // Fix the symbols
      for (const issue of issues) {
        // Check if the corrected symbol already exists
        const { data: existing } = await supabase
          .from('instruments')
          .select('id')
          .eq('symbol', issue.corrected)
          .neq('id', issue.id)
          .single();

        if (existing) {
          // Symbol already exists, we need to handle this differently
          // Option 1: Delete the duplicate
          // Option 2: Merge the records
          // For now, we'll skip and report it
          console.warn(`[WARN] Symbol ${issue.corrected} already exists. Skipping update for ${issue.current}`);
          continue;
        }

        // Update the symbol
        const { error: updateError } = await supabase
          .from('instruments')
          .update({ symbol: issue.corrected })
          .eq('id', issue.id);

        if (updateError) {
          console.error(`[ERROR] Failed to update instrument ${issue.id}:`, updateError);
        } else {
          fixed.push({
            id: issue.id,
            old: issue.current,
            new: issue.corrected,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun 
        ? `Found ${issues.length} instruments that need fixing (dry run mode)`
        : `Fixed ${fixed.length} out of ${issues.length} instruments`,
      checked: instruments.length,
      issues: issues,
      fixed: dryRun ? [] : fixed,
      dryRun,
    });
  } catch (error: any) {
    console.error('[ERROR] Error fixing instrument symbols:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fix instrument symbols',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // GET request is a dry-run by default
  try {
    const supabase = createServerClient();
    
    // Get all instruments from Supabase
    const { data: instruments, error: fetchError } = await supabase
      .from('instruments')
      .select('id, symbol, type, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch instruments: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!instruments || instruments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No instruments found in database',
        checked: 0,
        issues: [],
      });
    }

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

    return NextResponse.json({
      success: true,
      message: `Checked ${instruments.length} instruments. Found ${issues.length} that need fixing.`,
      checked: instruments.length,
      correct: correct.length,
      issues: issues.length,
      details: {
        issues,
        correct,
      },
    });
  } catch (error: any) {
    console.error('[ERROR] Error checking instrument symbols:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to check instrument symbols',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
