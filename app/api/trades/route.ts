import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentPrice } from '@/lib/api/deriv';

export async function GET(request: NextRequest) {
  try {
    const response = new NextResponse();
    const supabase = createServerClient(request, response);
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:16',message:'Before getUser call in GET',data:{hasSupabase:!!supabase,method:'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:21',message:'After getUser call in GET',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (userError || !user) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:24',message:'Returning 401 Unauthorized in GET',data:{userError:userError?.message,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'active', 'closed', 'all'
    const account_id = searchParams.get('account_id'); // Optional: filter by account

    // Get selected account if no account_id specified
    let selectedAccountId = account_id;
    if (!selectedAccountId) {
      const { data: selectedAccount } = await supabase
        .from('deriv_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_selected', true)
        .single();
      
      if (selectedAccount) {
        selectedAccountId = selectedAccount.id;
      }
    }

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (selectedAccountId) {
      query = query.eq('deriv_account_id', selectedAccountId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: trades, error } = await query;

    if (error) {
      console.error('Error fetching trades:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trades' },
        { status: 500 }
      );
    }

    // Update current prices for active trades
    if (trades) {
      const activeTrades = trades.filter(t => t.status === 'active' || t.status === 'pending');
      const symbolSet = new Set(activeTrades.map(t => t.symbol));
      
      for (const symbol of symbolSet) {
        try {
          const priceData = await getCurrentPrice(symbol);
          if (priceData) {
            // Update all trades with this symbol
            await supabase
              .from('trades')
              .update({ current_price: priceData.price })
              .eq('user_id', user.id)
              .eq('symbol', symbol)
              .in('status', ['active', 'pending']);
          }
        } catch (error) {
          console.error(`Error updating price for ${symbol}:`, error);
        }
      }

      // Re-fetch trades with updated prices
      const { data: updatedTrades } = await query;
      return NextResponse.json({
        success: true,
        trades: updatedTrades || trades,
      }, {
        headers: response.headers,
      });
    }

    return NextResponse.json({
      success: true,
      trades: trades || [],
    }, {
      headers: response.headers,
    });
  } catch (error: any) {
    console.error('Error in GET /api/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { trade_id, action, notes } = body;

    if (!trade_id || !action) {
      return NextResponse.json(
        { error: 'Trade ID and action are required' },
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

    // Get trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', trade_id)
      .eq('user_id', user.id)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      );
    }

    if (action === 'update_notes') {
      const { error: updateError } = await supabase
        .from('trades')
        .update({ notes: notes || null })
        .eq('id', trade_id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update notes' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Notes updated successfully',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in PATCH /api/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
