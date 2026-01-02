// API Route: /api/signals/update-price - Update current price for active signals

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { fetchMarketDataForTimeframes } from '@/lib/data/fetcher';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, signal_ids } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get all active/watching signals for the user
    const query = supabase
      .from('watchlist_signals')
      .select('id, instrument, status')
      .eq('user_id', user_id)
      .in('status', ['watching', 'signal_ready', 'active']);

    if (signal_ids && Array.isArray(signal_ids) && signal_ids.length > 0) {
      query.in('id', signal_ids);
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
        updates: [],
      });
    }

    // Fetch current prices for all instruments
    const updates = [];
    const uniqueInstruments = [...new Set(signals.map(s => s.instrument))];

    for (const instrument of uniqueInstruments) {
      try {
        // Fetch just the latest candle to get current price
        const data = await fetchMarketDataForTimeframes(instrument, ['5m']);
        if (data && data['5m'] && data['5m'].length > 0) {
          const latestCandle = data['5m'][data['5m'].length - 1];
          const currentPrice = latestCandle.close;

          // Update all signals for this instrument
          const signalsForInstrument = signals.filter(s => s.instrument === instrument);
          
          for (const signal of signalsForInstrument) {
            const { error: updateError } = await supabase
              .from('watchlist_signals')
              .update({
                current_price: currentPrice,
                price_updated_at: new Date().toISOString(),
              })
              .eq('id', signal.id);

            if (!updateError) {
              updates.push({
                signal_id: signal.id,
                instrument,
                current_price: currentPrice,
              });
            }

            // Check if price hit SL or TP (for active trades)
            if (signal.status === 'active') {
              const { data: signalData } = await supabase
                .from('watchlist_signals')
                .select('direction, entry_price, stop_loss, take_profit')
                .eq('id', signal.id)
                .single();

              if (signalData) {
                const { direction, entry_price, stop_loss, take_profit } = signalData;
                let hitSL = false;
                let hitTP = false;

                if (direction === 'long') {
                  hitSL = stop_loss && currentPrice <= parseFloat(stop_loss.toString());
                  hitTP = take_profit && Array.isArray(take_profit) && 
                          take_profit.some(tp => currentPrice >= parseFloat(tp.toString()));
                } else if (direction === 'short') {
                  hitSL = stop_loss && currentPrice >= parseFloat(stop_loss.toString());
                  hitTP = take_profit && Array.isArray(take_profit) && 
                          take_profit.some(tp => currentPrice <= parseFloat(tp.toString()));
                }

                if (hitSL) {
                  await supabase
                    .from('watchlist_signals')
                    .update({
                      status: 'hit_sl',
                      exit_price: currentPrice,
                      exit_reason: 'sl',
                      trade_closed_at: new Date().toISOString(),
                    })
                    .eq('id', signal.id);
                } else if (hitTP) {
                  await supabase
                    .from('watchlist_signals')
                    .update({
                      status: 'hit_tp',
                      exit_price: currentPrice,
                      exit_reason: 'tp',
                      trade_closed_at: new Date().toISOString(),
                    })
                    .eq('id', signal.id);
                }
              }
            }
          }
        }
      } catch (priceError: any) {
        console.error(`Error fetching price for ${instrument}:`, priceError);
        // Continue with other instruments
      }
    }

    return NextResponse.json({
      success: true,
      updates,
    });
  } catch (error: any) {
    console.error('Error in POST /api/signals/update-price:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
