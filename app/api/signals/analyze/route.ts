// API Route: /api/signals/analyze - Auto-analyze signals

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { analyze } from '@/lib/analysis/engine';
import { fetchMarketDataForTimeframes } from '@/lib/data/fetcher';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, signal_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get signal(s) to analyze
    let query = supabase
      .from('watchlist_signals')
      .select('id, instrument, analysis_run_id, status')
      .eq('user_id', user_id)
      .in('status', ['watching', 'signal_ready', 'active']); // Only analyze active signals

    if (signal_id) {
      query = query.eq('id', signal_id);
    }

    const { data: signals, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching signals:', fetchError);
      return NextResponse.json(
        { error: fetchError.message || 'Failed to fetch signals' },
        { status: 500 }
      );
    }

    if (!signals || signals.length === 0) {
      return NextResponse.json({
        success: true,
        analyzed: [],
        message: 'No signals to analyze',
      });
    }

    const analyzed = [];

    // Analyze each signal
    for (const signal of signals) {
      try {
        // Run analysis for the instrument
        const data = await fetchMarketDataForTimeframes(signal.instrument, ['2h', '15m', '5m']);
        
        if (!data['2h'] || !data['15m'] || !data['5m'] || 
            data['2h'].length === 0 || data['15m'].length === 0 || data['5m'].length === 0) {
          console.warn(`Insufficient data for ${signal.instrument}`);
          continue;
        }

        const analysisResult = analyze(signal.instrument, {
          '2h': data['2h'],
          '15m': data['15m'],
          '5m': data['5m'],
        });

        // Update the signal with new analysis data
        // Note: last_analyzed_at will be set later to match analysis_run timestamp
        const updateData: any = {
          analysis_data: analysisResult,
          updated_at: new Date().toISOString(),
        };

        // If analysis shows TRADE_SETUP and status is 'watching', update to 'signal_ready'
        if (analysisResult.final_decision === 'TRADE_SETUP' && signal.status === 'watching') {
          updateData.status = 'signal_ready';
          updateData.signal_generated_at = new Date().toISOString();
          
          // Extract trade levels from analysis
          const tf5m = analysisResult.timeframe_5m;
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
        } else if (analysisResult.final_decision === 'TRADE_SETUP' && signal.status === 'signal_ready') {
          // Update trade levels if they changed (signal_ready status)
          const tf5m = analysisResult.timeframe_5m;
          if (tf5m) {
            updateData.direction = tf5m.direction;
            updateData.entry_price = tf5m.entry_price ? parseFloat(tf5m.entry_price.toString()) : null;
            updateData.stop_loss = tf5m.stop_price ? parseFloat(tf5m.stop_price.toString()) : null;
            
            if (tf5m.target_price) {
              const tp = parseFloat(tf5m.target_price.toString());
              updateData.take_profit = [tp];
            }
          }
        }

        // Also create/update analysis_run record for reference
        // Get or create instrument
        let { data: instrumentData } = await supabase
          .from('instruments')
          .select('id')
          .eq('symbol', signal.instrument.toUpperCase())
          .single();

        if (!instrumentData) {
          const { data: newInstrument } = await supabase
            .from('instruments')
            .insert({
              symbol: signal.instrument.toUpperCase(),
              type: 'forex',
            })
            .select('id')
            .single();
          instrumentData = newInstrument;
        }

        const instrumentId = instrumentData?.id;

        // Use the same timestamp for analysis_run and last_analyzed_at
        const analysisTimestamp = new Date().toISOString();

        // Create analysis run
        const { data: analysisRun } = await supabase
          .from('analysis_runs')
          .insert({
            instrument_id: instrumentId,
            timestamp: analysisTimestamp,
            data_window_start: new Date(analysisResult.data_window_start).toISOString(),
            data_window_end: new Date(analysisResult.data_window_end).toISOString(),
            status: 'completed',
          })
          .select('id, timestamp')
          .single();

        if (analysisRun) {
          // Use the timestamp from the analysis_run to ensure they match exactly
          updateData.analysis_run_id = analysisRun.id;
          // Use the timestamp from the database to ensure exact sync with Recent Analysis Runs
          updateData.last_analyzed_at = (analysisRun as any).timestamp || analysisTimestamp;

          // Store analysis results
          await supabase.from('analysis_results').insert([
            {
              analysis_run_id: analysisRun.id,
              timeframe: '2h',
              result_data: analysisResult.timeframe_2h,
            },
            {
              analysis_run_id: analysisRun.id,
              timeframe: '15m',
              result_data: analysisResult.timeframe_15m,
            },
            {
              analysis_run_id: analysisRun.id,
              timeframe: '5m',
              result_data: analysisResult.timeframe_5m,
            },
          ]);

          // Store trade signal
          await supabase.from('trade_signals').insert({
            analysis_run_id: analysisRun.id,
            signal_type: analysisResult.final_decision,
            direction: analysisResult.timeframe_5m.direction,
            entry_zone: analysisResult.timeframe_5m.entry_zone,
            stop_level: analysisResult.timeframe_5m.stop_level,
            target_zone: analysisResult.timeframe_5m.target_zone,
            confidence: analysisResult.timeframe_5m.confidence,
            signal_data: analysisResult,
          });
        } else {
          // If analysis_run creation failed, still set last_analyzed_at
          updateData.last_analyzed_at = analysisTimestamp;
        }

        // Update the signal
        const { error: updateError } = await supabase
          .from('watchlist_signals')
          .update(updateData)
          .eq('id', signal.id);

        if (!updateError) {
          analyzed.push({
            signal_id: signal.id,
            instrument: signal.instrument,
            status: analysisResult.final_decision,
            analysis_run_id: analysisRun?.id || null,
          });
        } else {
          console.error(`Error updating signal ${signal.id}:`, updateError);
        }
      } catch (error: any) {
        console.error(`Error analyzing ${signal.instrument}:`, error);
        // Continue with other signals
      }
    }

    return NextResponse.json({
      success: true,
      analyzed,
      count: analyzed.length,
    });
  } catch (error: any) {
    console.error('Error in POST /api/signals/analyze:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
