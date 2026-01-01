// API Route: /api/analysis/history - Get analysis history grouped by instrument

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json({
        success: true,
        history: {},
      });
    }

    if (!supabase) {
      return NextResponse.json({
        success: true,
        history: {},
      });
    }

    // Fetch all analysis runs with their instruments and trade signals
    const { data: analysisRuns, error } = await supabase
      .from('analysis_runs')
      .select(`
        id,
        timestamp,
        status,
        instruments!inner(symbol),
        trade_signals(signal_type, direction, confidence)
      `)
      .order('timestamp', { ascending: false });

    if (error) {
      console.warn('[WARN] Failed to fetch analysis history:', error);
      return NextResponse.json({
        success: true,
        history: {},
      });
    }

    // Group by instrument symbol
    const historyByInstrument: Record<string, any[]> = {};

    if (analysisRuns) {
      for (const run of analysisRuns) {
        const instrument = (run.instruments as any)?.symbol || 'UNKNOWN';
        const tradeSignals = (run.trade_signals as any[]) || [];

        if (!historyByInstrument[instrument]) {
          historyByInstrument[instrument] = [];
        }

        historyByInstrument[instrument].push({
          id: run.id,
          timestamp: run.timestamp,
          status: run.status,
          signal_type: tradeSignals[0]?.signal_type || run.status,
          direction: tradeSignals[0]?.direction || null,
          confidence: tradeSignals[0]?.confidence || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      history: historyByInstrument,
    });
  } catch (error: any) {
    console.error('Error fetching analysis history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analysis history' },
      { status: 500 }
    );
  }
}

