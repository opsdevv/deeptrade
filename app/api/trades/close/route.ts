import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentPrice } from '@/lib/api/deriv';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trade_ids, filter } = body; // filter: 'all', 'losing', 'profitable'

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

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending']);

    if (trade_ids && Array.isArray(trade_ids) && trade_ids.length > 0) {
      query = query.in('id', trade_ids);
    }

    const { data: trades, error: tradesError } = await query;

    if (tradesError) {
      return NextResponse.json(
        { error: 'Failed to fetch trades' },
        { status: 500 }
      );
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json(
        { error: 'No active trades found' },
        { status: 404 }
      );
    }

    // Filter trades based on filter parameter
    let tradesToClose = trades;
    if (filter === 'losing') {
      tradesToClose = trades.filter(t => {
        if (!t.current_price || !t.entry_price) return false;
        const pnl = t.direction === 'long' 
          ? (t.current_price - t.entry_price) / t.entry_price
          : (t.entry_price - t.current_price) / t.entry_price;
        return pnl < 0;
      });
    } else if (filter === 'profitable') {
      tradesToClose = trades.filter(t => {
        if (!t.current_price || !t.entry_price) return false;
        const pnl = t.direction === 'long' 
          ? (t.current_price - t.entry_price) / t.entry_price
          : (t.entry_price - t.current_price) / t.entry_price;
        return pnl > 0;
      });
    }

    if (tradesToClose.length === 0) {
      return NextResponse.json(
        { error: 'No trades match the filter criteria' },
        { status: 404 }
      );
    }

    // Close each trade
    const closedTrades = [];
    let totalPnl = 0;
    let hasLoss = false;
    let hasWin = false;

    for (const trade of tradesToClose) {
      // Get current price
      const priceData = await getCurrentPrice(trade.symbol);
      const closePrice = priceData?.price || trade.current_price || trade.entry_price;

      // Calculate PNL
      let pnl = 0;
      let pnlPercentage = 0;
      if (trade.direction === 'long') {
        pnl = (closePrice - trade.entry_price) * trade.lot_size * trade.number_of_positions;
        pnlPercentage = ((closePrice - trade.entry_price) / trade.entry_price) * 100;
      } else {
        pnl = (trade.entry_price - closePrice) * trade.lot_size * trade.number_of_positions;
        pnlPercentage = ((trade.entry_price - closePrice) / trade.entry_price) * 100;
      }

      if (pnl < 0) hasLoss = true;
      if (pnl > 0) hasWin = true;

      totalPnl += pnl;

      // Update trade
      const { data: updatedTrade, error: updateError } = await supabase
        .from('trades')
        .update({
          status: 'closed',
          close_price: closePrice,
          current_price: closePrice,
          pnl: pnl,
          pnl_percentage: pnlPercentage,
          close_reason: filter ? `Closed via ${filter} filter` : 'Manually closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', trade.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error closing trade:', updateError);
        continue;
      }

      // Log trade closure
      await supabase.from('trade_logs').insert({
        trade_id: trade.id,
        user_id: user.id,
        log_type: 'trade_closed',
        message: `Trade closed: ${trade.symbol} ${trade.direction} at ${closePrice}`,
        data: {
          close_price: closePrice,
          pnl: pnl,
          pnl_percentage: pnlPercentage,
          filter: filter,
        },
      });

      closedTrades.push(updatedTrade);
    }

    // Create cooldown period if there was a loss
    if (hasLoss && totalPnl < 0) {
      const endsAt = new Date();
      endsAt.setMinutes(endsAt.getMinutes() + 13); // 13 minutes cooldown after loss

      await supabase.from('cooldown_periods').insert({
        user_id: user.id,
        trade_id: closedTrades[0]?.id,
        cooldown_type: 'loss',
        started_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        is_active: true,
      });

      // Log cooldown
      await supabase.from('trade_logs').insert({
        user_id: user.id,
        log_type: 'cooldown_started',
        message: 'Cooldown period started: 13 minutes after loss',
        data: {
          cooldown_type: 'loss',
          ends_at: endsAt.toISOString(),
        },
      });
    } else if (hasWin && totalPnl > 0) {
      const endsAt = new Date();
      endsAt.setMinutes(endsAt.getMinutes() + 10); // 10 minutes cooldown after win

      await supabase.from('cooldown_periods').insert({
        user_id: user.id,
        trade_id: closedTrades[0]?.id,
        cooldown_type: 'win',
        started_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        is_active: true,
      });

      // Log cooldown
      await supabase.from('trade_logs').insert({
        user_id: user.id,
        log_type: 'cooldown_started',
        message: 'Cooldown period started: 10 minutes after win',
        data: {
          cooldown_type: 'win',
          ends_at: endsAt.toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      closed_trades: closedTrades,
      total_pnl: totalPnl,
      message: `Closed ${closedTrades.length} trade(s)`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/trades/close:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
