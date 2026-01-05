// API Route: /api/analysis/history - Get analysis history grouped by instrument

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// Cleanup function to delete old analysis runs (non-blocking)
async function cleanupOldRuns(supabase: any) {
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get all analysis_run_ids that are referenced in watchlist_signals
    const { data: watchlistRuns } = await supabase
      .from('watchlist_signals')
      .select('analysis_run_id')
      .not('analysis_run_id', 'is', null);

    const protectedRunIds = new Set(
      (watchlistRuns || [])
        .map((w: { analysis_run_id: string | null }) => w.analysis_run_id)
        .filter((id: string | null): id is string => id !== null)
    );

    // Find analysis runs older than 24 hours that are not in watchlist
    const { data: oldRuns } = await supabase
      .from('analysis_runs')
      .select('id')
      .lt('timestamp', twentyFourHoursAgo.toISOString());

    // Filter out protected runs (those in watchlist)
    const runsToDelete = (oldRuns || [])
      .filter((run: { id: string }) => !protectedRunIds.has(run.id))
      .map((run: { id: string }) => run.id);

    if (runsToDelete.length > 0) {
      // Delete the analysis runs (CASCADE will delete related records)
      await supabase
        .from('analysis_runs')
        .delete()
        .in('id', runsToDelete);
      
      console.log(`[CLEANUP] Deleted ${runsToDelete.length} old analysis run(s)`);
    }
  } catch (error: any) {
    // Log error but don't throw - cleanup is non-critical
    console.error('[CLEANUP] Error cleaning up old runs:', error);
  }
}

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

    // Group by instrument symbol and limit to 5 most recent per instrument
    const historyByInstrument: Record<string, any[]> = {};

    if (analysisRuns) {
      for (const run of analysisRuns) {
        const instrument = (run.instruments as any)?.symbol || 'UNKNOWN';
        const tradeSignals = (run.trade_signals as any[]) || [];

        if (!historyByInstrument[instrument]) {
          historyByInstrument[instrument] = [];
        }

        // Only add if we have less than 5 for this instrument
        if (historyByInstrument[instrument].length < 5) {
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
    }

    // Trigger cleanup in the background (non-blocking)
    if (supabase) {
      cleanupOldRuns(supabase).catch((err) => {
        console.error('[CLEANUP] Background cleanup error:', err);
      });
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

