import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentPrice } from '@/lib/api/deriv';

export async function GET(request: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:5',message:'GET /api/trades entry',data:{url:request.url,method:request.method},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
  // #endregion
  try {
    let supabase;
    try {
      supabase = createServerClient();
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:11',message:'Supabase client created',data:{hasSupabase:!!supabase,clientType:supabase?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:16',message:'Error creating Supabase client',data:{error:error?.message,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:22',message:'Before getUser call in GET',data:{hasSupabase:!!supabase,method:'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:26',message:'After getUser call in GET',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message,errorCode:userError?.code,errorStatus:userError?.status,userId:user?.id,userEmail:user?.email},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion
    if (userError || !user) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:30',message:'Returning 401 Unauthorized in GET',data:{userError:userError?.message,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'active', 'closed', 'all'
    const account_id = searchParams.get('account_id'); // Optional: Deriv login ID (account_id from Deriv API)
    const deriv_account_id = searchParams.get('deriv_account_id'); // Optional: Database UUID

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:35',message:'Processing account filter',data:{account_id,deriv_account_id,status,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion

    // Get selected account if no account_id specified
    let selectedAccountDbId = deriv_account_id; // Database UUID
    let selectedAccountLoginId = account_id; // Deriv login ID
    
    if (!selectedAccountDbId && !selectedAccountLoginId) {
      // Try to get selected account from database
      const { data: selectedAccount } = await supabase
        .from('deriv_accounts')
        .select('id, login_id')
        .eq('user_id', user.id)
        .eq('is_selected', true)
        .single();
      
      if (selectedAccount) {
        selectedAccountDbId = selectedAccount.id;
        selectedAccountLoginId = selectedAccount.login_id;
      }
    } else if (selectedAccountLoginId && !selectedAccountDbId) {
      // Look up database ID from Deriv login ID
      const { data: accountRecord } = await supabase
        .from('deriv_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('login_id', selectedAccountLoginId)
        .single();
      
      if (accountRecord) {
        selectedAccountDbId = accountRecord.id;
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:60',message:'Account filter resolved',data:{selectedAccountDbId,selectedAccountLoginId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (selectedAccountDbId) {
      // Filter by deriv_account_id OR setup_data.account_id (for trades created via API key)
      // Convert to string to ensure consistent matching
      const loginIdStr = String(selectedAccountLoginId || '');
      query = query.or(`deriv_account_id.eq.${selectedAccountDbId},setup_data->>account_id.eq.${loginIdStr}`);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:68',message:'Filtering trades by deriv_account_id or setup_data.account_id',data:{derivAccountId:selectedAccountDbId,loginId:selectedAccountLoginId,loginIdStr},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
    } else if (selectedAccountLoginId) {
      // If we only have login_id, filter by setup_data.account_id or look up database ID
      // First get the account database ID if it exists
      const { data: accountRecord } = await supabase
        .from('deriv_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('login_id', selectedAccountLoginId)
        .single();
      
      if (accountRecord) {
        // Filter by deriv_account_id OR setup_data.account_id
        const loginIdStr = String(selectedAccountLoginId);
        query = query.or(`deriv_account_id.eq.${accountRecord.id},setup_data->>account_id.eq.${loginIdStr}`);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:80',message:'Filtering trades by login_id (resolved to DB ID or setup_data)',data:{loginId:selectedAccountLoginId,loginIdStr,derivAccountId:accountRecord.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
      } else {
        // Account not in database, filter by setup_data.account_id only
        const loginIdStr = String(selectedAccountLoginId);
        query = query.eq('setup_data->>account_id', loginIdStr);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:87',message:'Filtering trades by setup_data.account_id only (account not in DB)',data:{loginId:selectedAccountLoginId,loginIdStr},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
      }
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: trades, error } = await query;
    
    // If no trades found with account filter, try loading all trades for the user
    // This handles cases where account_id format might not match
    if ((!trades || trades.length === 0) && (selectedAccountDbId || selectedAccountLoginId)) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:118',message:'No trades found with account filter, trying without filter',data:{selectedAccountDbId,selectedAccountLoginId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      
      // Fallback: load all trades for user (without account filter)
      let fallbackQuery = supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (status && status !== 'all') {
        fallbackQuery = fallbackQuery.eq('status', status);
      }
      
      const { data: allTrades } = await fallbackQuery;
      if (allTrades && allTrades.length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:130',message:'Found trades without account filter',data:{allTradesCount:allTrades.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        // Use all trades as fallback
        const { data: updatedTrades } = await fallbackQuery;
        return NextResponse.json({
          success: true,
          trades: updatedTrades || allTrades,
        });
      }
    }

    if (error) {
      console.error('Error fetching trades:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trades' },
        { status: 500 }
      );
    }

    // Update current prices and calculate PNL for active trades
    if (trades) {
      const activeTrades = trades.filter(t => t.status === 'active' || t.status === 'pending');
      const symbolSet = new Set(activeTrades.map(t => t.symbol));
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:78',message:'Before updating prices and calculating PNL',data:{totalTrades:trades.length,activeTradesCount:activeTrades.length,symbols:Array.from(symbolSet)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      for (const symbol of symbolSet) {
        try {
          const priceData = await getCurrentPrice(symbol);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:85',message:'Got price data for symbol',data:{symbol,hasPriceData:!!priceData,price:priceData?.price},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (priceData) {
            const currentPrice = priceData.price;
            // Get all active trades for this symbol
            const symbolTrades = activeTrades.filter(t => t.symbol === symbol);
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:92',message:'Processing trades for symbol',data:{symbol,symbolTradesCount:symbolTrades.length,trades:symbolTrades.map(t=>({id:t.id,status:t.status,entry_price:t.entry_price,direction:t.direction,lot_size:t.lot_size,number_of_positions:t.number_of_positions}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Calculate and update PNL for each trade
            for (const trade of symbolTrades) {
              let pnl = 0;
              let pnlPercentage = 0;
              
              if (trade.direction === 'long') {
                pnl = (currentPrice - trade.entry_price) * trade.lot_size * trade.number_of_positions;
                pnlPercentage = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
              } else {
                pnl = (trade.entry_price - currentPrice) * trade.lot_size * trade.number_of_positions;
                pnlPercentage = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
              }
              
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:105',message:'Calculated PNL for trade',data:{tradeId:trade.id,symbol,currentPrice,entryPrice:trade.entry_price,direction:trade.direction,lotSize:trade.lot_size,positions:trade.number_of_positions,calculatedPnl:pnl,calculatedPnlPercentage:pnlPercentage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              // Update trade with current price and PNL
              await supabase
                .from('trades')
                .update({ 
                  current_price: currentPrice,
                  pnl: pnl,
                  pnl_percentage: pnlPercentage,
                })
                .eq('id', trade.id);
              
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:116',message:'Updated trade with PNL',data:{tradeId:trade.id,updatedPnl:pnl,updatedPnlPercentage:pnlPercentage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
            }
          }
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:121',message:'Error updating price/PNL',data:{symbol,error:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          console.error(`Error updating price for ${symbol}:`, error);
        }
      }

      // Re-fetch trades with updated prices and PNL
      const { data: updatedTrades } = await query;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/trades/route.ts:130',message:'Returning updated trades',data:{updatedTradesCount:updatedTrades?.length||0,firstTradePnl:updatedTrades?.[0]?.pnl,firstTradePnlPercentage:updatedTrades?.[0]?.pnl_percentage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({
        success: true,
        trades: updatedTrades || trades,
      }, {
      });
    }

    return NextResponse.json({
      success: true,
      trades: trades || [],
    }, {
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
    const { trade_id, action, notes, entry_price, stop_loss, target_price, lot_size, number_of_positions } = body;

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

    if (action === 'update_setup') {
      // Only allow updating pending trades
      if (trade.status !== 'pending') {
        return NextResponse.json(
          { error: 'Can only update pending trades/setups' },
          { status: 400 }
        );
      }

      const updateData: any = {};
      if (entry_price !== undefined) updateData.entry_price = entry_price;
      if (stop_loss !== undefined) updateData.stop_loss = stop_loss;
      if (target_price !== undefined) updateData.target_price = target_price;
      if (lot_size !== undefined) updateData.lot_size = lot_size;
      if (number_of_positions !== undefined) updateData.number_of_positions = number_of_positions;

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      const { data: updatedTrade, error: updateError } = await supabase
        .from('trades')
        .update(updateData)
        .eq('id', trade_id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update setup' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        trade: updatedTrade,
        message: 'Setup updated successfully',
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
