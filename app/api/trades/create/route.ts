import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentPrice } from '@/lib/api/deriv';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setups, symbol, lot_size, number_of_positions, message_id } = body;

    if (!setups || !Array.isArray(setups) || setups.length === 0) {
      return NextResponse.json(
        { error: 'Invalid setups data' },
        { status: 400 }
      );
    }

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    if (!lot_size || lot_size <= 0) {
      return NextResponse.json(
        { error: 'Valid lot size is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check for selected Deriv account
    const { data: derivAccount, error: accountError } = await supabase
      .from('deriv_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_selected', true)
      .single();

    if (accountError || !derivAccount) {
      return NextResponse.json(
        { error: 'No trading account selected. Please select an account in Settings first.' },
        { status: 400 }
      );
    }

    // Check for active cooldown period
    const { data: activeCooldown } = await supabase
      .from('cooldown_periods')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('ends_at', new Date().toISOString())
      .single();

    if (activeCooldown) {
      const remainingMinutes = Math.ceil(
        (new Date(activeCooldown.ends_at).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        { error: `Trading is on cooldown. ${remainingMinutes} minutes remaining.` },
        { status: 400 }
      );
    }

    // Get current price for the symbol
    const currentPriceData = await getCurrentPrice(symbol);
    if (!currentPriceData) {
      return NextResponse.json(
        { error: 'Could not fetch current price for symbol' },
        { status: 400 }
      );
    }

    // Parse prices from setups and create trades
    const trades = [];
    for (const setup of setups) {
      // Extract numeric values from strings
      const parsePrice = (str: string): number | null => {
        const match = str.match(/([0-9.]+)/);
        return match ? parseFloat(match[1]) : null;
      };

      const entryPrice = parsePrice(setup.entryZone) || parsePrice(setup.price) || currentPriceData.price;
      const stopLoss = parsePrice(setup.stopLoss);
      const targetPrice = parsePrice(setup.target);
      const triggerPrice = parsePrice(setup.price) || entryPrice;

      // Create trade record
      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          deriv_account_id: derivAccount.id,
          symbol: symbol,
          direction: setup.type === 'bullish' ? 'long' : 'short',
          entry_price: entryPrice,
          stop_loss: stopLoss,
          target_price: targetPrice,
          lot_size: lot_size,
          number_of_positions: number_of_positions || 1,
          current_price: currentPriceData.price,
          status: 'pending',
          trigger_price: triggerPrice,
          trigger_condition: setup.trigger,
          setup_data: {
            type: setup.type,
            entryZone: setup.entryZone,
            stopLoss: setup.stopLoss,
            target: setup.target,
            percentMove: setup.percentMove,
            trigger: setup.trigger,
            message_id: message_id,
          },
        })
        .select()
        .single();

      if (tradeError) {
        console.error('Error creating trade:', tradeError);
        continue;
      }

      // Log trade creation
      await supabase.from('trade_logs').insert({
        trade_id: trade.id,
        user_id: user.id,
        log_type: 'info',
        message: `Trade created: ${setup.type} setup for ${symbol}`,
        data: {
          setup: setup,
          lot_size: lot_size,
          number_of_positions: number_of_positions,
        },
      });

      trades.push(trade);
    }

    if (trades.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create any trades' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trades: trades,
      message: `Created ${trades.length} trade(s) successfully`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/trades/create:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
