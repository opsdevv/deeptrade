// API Route: /api/analysis/cleanup - Delete analysis runs older than 24 hours (excluding watchlist)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get all analysis_run_ids that are referenced in watchlist_signals
    const { data: watchlistRuns, error: watchlistError } = await supabase
      .from('watchlist_signals')
      .select('analysis_run_id')
      .not('analysis_run_id', 'is', null);

    if (watchlistError) {
      console.error('Error fetching watchlist runs:', watchlistError);
      return NextResponse.json(
        { error: 'Failed to fetch watchlist runs' },
        { status: 500 }
      );
    }

    const protectedRunIds = new Set(
      (watchlistRuns || [])
        .map((w) => w.analysis_run_id)
        .filter((id): id is string => id !== null)
    );

    // Find analysis runs older than 24 hours that are not in watchlist
    const { data: oldRuns, error: fetchError } = await supabase
      .from('analysis_runs')
      .select('id')
      .lt('timestamp', twentyFourHoursAgo.toISOString());

    if (fetchError) {
      console.error('Error fetching old runs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch old analysis runs' },
        { status: 500 }
      );
    }

    // Filter out protected runs (those in watchlist)
    const runsToDelete = (oldRuns || [])
      .filter((run) => !protectedRunIds.has(run.id))
      .map((run) => run.id);

    if (runsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'No analysis runs to clean up',
      });
    }

    // Delete the analysis runs (CASCADE will delete related records)
    const { error: deleteError } = await supabase
      .from('analysis_runs')
      .delete()
      .in('id', runsToDelete);

    if (deleteError) {
      console.error('Error deleting old runs:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete old analysis runs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: runsToDelete.length,
      message: `Deleted ${runsToDelete.length} analysis run(s) older than 24 hours`,
    });
  } catch (error: any) {
    console.error('Error in cleanup:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup analysis runs' },
      { status: 500 }
    );
  }
}

// GET endpoint to check what would be deleted (dry run)
export async function GET(request: NextRequest) {
  try {
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get all analysis_run_ids that are referenced in watchlist_signals
    const { data: watchlistRuns, error: watchlistError } = await supabase
      .from('watchlist_signals')
      .select('analysis_run_id')
      .not('analysis_run_id', 'is', null);

    if (watchlistError) {
      console.error('Error fetching watchlist runs:', watchlistError);
      return NextResponse.json(
        { error: 'Failed to fetch watchlist runs' },
        { status: 500 }
      );
    }

    const protectedRunIds = new Set(
      (watchlistRuns || [])
        .map((w) => w.analysis_run_id)
        .filter((id): id is string => id !== null)
    );

    // Find analysis runs older than 24 hours
    const { data: oldRuns, error: fetchError } = await supabase
      .from('analysis_runs')
      .select('id, timestamp, instruments!inner(symbol)')
      .lt('timestamp', twentyFourHoursAgo.toISOString())
      .order('timestamp', { ascending: true });

    if (fetchError) {
      console.error('Error fetching old runs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch old analysis runs' },
        { status: 500 }
      );
    }

    const runsToDelete = (oldRuns || [])
      .filter((run) => !protectedRunIds.has(run.id))
      .map((run) => ({
        id: run.id,
        timestamp: run.timestamp,
        instrument: (run.instruments as any)?.symbol || 'UNKNOWN',
      }));

    return NextResponse.json({
      success: true,
      wouldDelete: runsToDelete.length,
      runs: runsToDelete,
      protected: protectedRunIds.size,
      message: `Would delete ${runsToDelete.length} analysis run(s) older than 24 hours`,
    });
  } catch (error: any) {
    console.error('Error in cleanup dry run:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check cleanup status' },
      { status: 500 }
    );
  }
}
