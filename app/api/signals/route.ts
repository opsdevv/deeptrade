// API Route: /api/signals - Manage watchlist signals

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// GET - Fetch all signals for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    
    const { data: signals, error } = await supabase
      .from('watchlist_signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching signals:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch signals' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signals: signals || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/signals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add instrument to watchlist or update existing signal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, instrument, analysis_run_id, analysis_data } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    if (!instrument) {
      return NextResponse.json(
        { error: 'Missing instrument' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check if signal already exists for this user and instrument
    const { data: existing } = await supabase
      .from('watchlist_signals')
      .select('id, status')
      .eq('user_id', user_id)
      .eq('instrument', instrument.toUpperCase())
      .in('status', ['watching', 'signal_ready', 'active'])
      .single();

    if (existing) {
      // Update existing signal with new analysis data
      const updateData: any = {
        analysis_run_id: analysis_run_id || existing.analysis_run_id,
        analysis_data: analysis_data || {},
        updated_at: new Date().toISOString(),
      };

      // Sync last_analyzed_at with analysis_run timestamp if analysis_run_id is provided
      if (analysis_run_id) {
        const { data: analysisRun } = await supabase
          .from('analysis_runs')
          .select('timestamp')
          .eq('id', analysis_run_id)
          .single();
        
        if (analysisRun) {
          updateData.last_analyzed_at = analysisRun.timestamp;
        }
      } else if (analysis_data?.timestamp) {
        // If no analysis_run_id but analysis_data has timestamp, use it
        updateData.last_analyzed_at = new Date(analysis_data.timestamp).toISOString();
      }

      // If analysis shows TRADE_SETUP, update status to signal_ready
      if (analysis_data?.final_decision === 'TRADE_SETUP' && existing.status === 'watching') {
        updateData.status = 'signal_ready';
        updateData.signal_generated_at = new Date().toISOString();
        
        // Extract trade levels from analysis
        const tf5m = analysis_data?.timeframe_5m;
        if (tf5m) {
          updateData.direction = tf5m.direction;
          updateData.entry_price = tf5m.entry_price ? parseFloat(tf5m.entry_price.toString()) : null;
          updateData.stop_loss = tf5m.stop_price ? parseFloat(tf5m.stop_price.toString()) : null;
          
          // Handle target price (can be array or single value)
          if (tf5m.target_price) {
            const tp = parseFloat(tf5m.target_price.toString());
            updateData.take_profit = [tp];
          }
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('watchlist_signals')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating signal:', updateError);
        return NextResponse.json(
          { error: updateError.message || 'Failed to update signal' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        signal: updated,
        isNew: false,
      });
    } else {
      // Create new watchlist entry
      const insertData: any = {
        user_id: user_id,
        instrument: instrument.toUpperCase(),
        analysis_run_id: analysis_run_id || null,
        status: 'watching',
        analysis_data: analysis_data || {},
      };

      // Sync last_analyzed_at with analysis_run timestamp if analysis_run_id is provided
      if (analysis_run_id) {
        const { data: analysisRun } = await supabase
          .from('analysis_runs')
          .select('timestamp')
          .eq('id', analysis_run_id)
          .single();
        
        if (analysisRun) {
          insertData.last_analyzed_at = analysisRun.timestamp;
        }
      } else if (analysis_data?.timestamp) {
        // If no analysis_run_id but analysis_data has timestamp, use it
        insertData.last_analyzed_at = new Date(analysis_data.timestamp).toISOString();
      }

      // If analysis shows TRADE_SETUP, set status to signal_ready
      if (analysis_data?.final_decision === 'TRADE_SETUP') {
        insertData.status = 'signal_ready';
        insertData.signal_generated_at = new Date().toISOString();
        
        // Extract trade levels from analysis
        const tf5m = analysis_data?.timeframe_5m;
        if (tf5m) {
          insertData.direction = tf5m.direction;
          insertData.entry_price = tf5m.entry_price ? parseFloat(tf5m.entry_price.toString()) : null;
          insertData.stop_loss = tf5m.stop_price ? parseFloat(tf5m.stop_price.toString()) : null;
          
          // Handle target price
          if (tf5m.target_price) {
            const tp = parseFloat(tf5m.target_price.toString());
            insertData.take_profit = [tp];
          }
        }
      }

      const { data: newSignal, error: insertError } = await supabase
        .from('watchlist_signals')
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating signal:', insertError);
        return NextResponse.json(
          { error: insertError.message || 'Failed to create signal' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        signal: newSignal,
        isNew: true,
      });
    }
  } catch (error: any) {
    console.error('Error in POST /api/signals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update signal status or trade information
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { signal_id, user_id, ...updateData } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    if (!signal_id) {
      return NextResponse.json(
        { error: 'Missing signal_id' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify the signal belongs to the user
    const { data: signal } = await supabase
      .from('watchlist_signals')
      .select('id, user_id')
      .eq('id', signal_id)
      .eq('user_id', user_id)
      .single();

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found or unauthorized' },
        { status: 404 }
      );
    }

    // Handle status changes
    if (updateData.status === 'active' && !updateData.trade_started_at) {
      updateData.trade_started_at = new Date().toISOString();
    }

    if (updateData.status === 'hit_sl' || updateData.status === 'hit_tp' || updateData.status === 'closed') {
      updateData.trade_closed_at = new Date().toISOString();
      if (!updateData.exit_reason) {
        if (updateData.status === 'hit_sl') updateData.exit_reason = 'sl';
        else if (updateData.status === 'hit_tp') updateData.exit_reason = 'tp';
        else updateData.exit_reason = 'manual';
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('watchlist_signals')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', signal_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating signal:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update signal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signal: updated,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/signals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove signal from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signalId = searchParams.get('signal_id');
    const userId = searchParams.get('user_id');

    if (!signalId || !userId) {
      return NextResponse.json(
        { error: 'Missing signal_id or user_id parameter' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify the signal belongs to the user
    const { data: signal } = await supabase
      .from('watchlist_signals')
      .select('id, user_id')
      .eq('id', signalId)
      .eq('user_id', userId)
      .single();

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found or unauthorized' },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('watchlist_signals')
      .delete()
      .eq('id', signalId);

    if (error) {
      console.error('Error deleting signal:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete signal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Signal deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/signals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
