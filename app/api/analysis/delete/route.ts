// API Route: /api/analysis/delete - Delete an analysis run

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');

    if (!runId) {
      return NextResponse.json(
        { error: 'Missing run_id parameter' },
        { status: 400 }
      );
    }

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

    // Delete the analysis run (cascade will delete related records)
    const { error } = await supabase
      .from('analysis_runs')
      .delete()
      .eq('id', runId);

    if (error) {
      console.error('Error deleting analysis run:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete analysis run' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Analysis run deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting analysis run:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete analysis run' },
      { status: 500 }
    );
  }
}

