import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { 
  getCurrentPrice, 
  getContractProposal, 
  buyContract, 
  sellContract, 
  getContractInfo,
  getContractType 
} from '@/lib/api/deriv';

/**
 * Monitor prices and execute trades when trigger conditions are met
 * This endpoint should be called periodically (e.g., every 10-30 seconds)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get all pending trades
    const { data: pendingTrades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (tradesError) {
      return NextResponse.json(
        { error: 'Failed to fetch pending trades' },
        { status: 500 }
      );
    }

    if (!pendingTrades || pendingTrades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending trades to monitor',
        executed: 0,
      });
    }

    // Group trades by symbol to minimize API calls
    const tradesBySymbol = new Map<string, typeof pendingTrades>();
    for (const trade of pendingTrades) {
      if (!tradesBySymbol.has(trade.symbol)) {
        tradesBySymbol.set(trade.symbol, []);
      }
      tradesBySymbol.get(trade.symbol)!.push(trade);
    }

    let executedCount = 0;
    const executedTrades = [];

    // Process each symbol
    for (const [symbol, trades] of tradesBySymbol) {
      try {
        // Get current price for symbol
        const priceData = await getCurrentPrice(symbol);
        if (!priceData) {
          console.warn(`Could not fetch price for ${symbol}`);
          continue;
        }

        const currentPrice = priceData.price;

        // Check each trade for trigger conditions
        for (const trade of trades) {
          // Check if user is in cooldown
          const { data: activeCooldown } = await supabase
            .from('cooldown_periods')
            .select('*')
            .eq('user_id', trade.user_id)
            .eq('is_active', true)
            .gt('ends_at', new Date().toISOString())
            .single();

          if (activeCooldown) {
            // Update trade status but don't execute
            await supabase
              .from('trades')
              .update({ current_price: currentPrice })
              .eq('id', trade.id);
            continue;
          }

          // Check trigger conditions
          let shouldExecute = false;

          if (trade.direction === 'long') {
            // Bullish: Break above trigger price with momentum
            if (currentPrice >= (trade.trigger_price || trade.entry_price)) {
              // Check for momentum (price is moving up)
              const priceChange = currentPrice - (trade.trigger_price || trade.entry_price);
              const percentChange = (priceChange / (trade.trigger_price || trade.entry_price)) * 100;
              
              // Execute if price is above trigger and has moved at least 0.1%
              if (percentChange >= 0.1) {
                shouldExecute = true;
              }
            }
          } else {
            // Bearish: Break below trigger price with displacement
            if (currentPrice <= (trade.trigger_price || trade.entry_price)) {
              // Check for displacement (price is moving down)
              const priceChange = (trade.trigger_price || trade.entry_price) - currentPrice;
              const percentChange = (priceChange / (trade.trigger_price || trade.entry_price)) * 100;
              
              // Execute if price is below trigger and has moved at least 0.1%
              if (percentChange >= 0.1) {
                shouldExecute = true;
              }
            }
          }

          if (shouldExecute) {
            // Get Deriv account with API token
            const { data: derivAccount } = await supabase
              .from('deriv_accounts')
              .select('*')
              .eq('id', trade.deriv_account_id)
              .single();

            if (!derivAccount || !derivAccount.api_token) {
              console.error(`No API token for account ${trade.deriv_account_id}`);
              
              // Log error
              await supabase.from('trade_logs').insert({
                trade_id: trade.id,
                user_id: trade.user_id,
                log_type: 'error',
                message: 'Cannot execute trade: No API token configured for account',
                data: { account_id: trade.deriv_account_id },
              });
              continue;
            }

            try {
              // Determine contract type based on symbol and direction
              const contractType = getContractType(trade.symbol, trade.direction);
              
              // Get contract proposal
              const proposal = await getContractProposal({
                amount: trade.lot_size,
                basis: 'stake',
                contract_type: contractType,
                currency: derivAccount.currency || 'USD',
                duration: 5, // 5 minutes - adjust as needed
                duration_unit: 'm',
                symbol: trade.symbol,
              });

              // Buy contract using API token
              // Note: We need to use the account's API token for authorization
              // For now, we'll use the global DERIV_API_KEY, but ideally should use account-specific token
              const contract = await buyContract(
                proposal.proposal.id,
                proposal.proposal.ask_price
              );

              // Update trade with contract info
              const { data: updatedTrade, error: updateError } = await supabase
                .from('trades')
                .update({
                  status: 'active',
                  entry_price: proposal.proposal.spot,
                  current_price: proposal.proposal.spot,
                  contract_id: contract.contract_id,
                  contract_type: contractType,
                  contract_amount: trade.lot_size,
                  contract_duration: 5 * 60, // 5 minutes in seconds
                  contract_purchase_time: new Date().toISOString(),
                })
                .eq('id', trade.id)
                .select()
                .single();

              if (updateError) {
                console.error('Error updating trade with contract:', updateError);
                continue;
              }

              // Log trade execution
              await supabase.from('trade_logs').insert({
                trade_id: trade.id,
                user_id: trade.user_id,
                log_type: 'trade_executed',
                message: `Contract purchased: ${contract.contract_id} for ${trade.symbol} ${trade.direction}`,
                data: {
                  contract_id: contract.contract_id,
                  contract_type: contractType,
                  buy_price: contract.buy_price,
                  spot_price: proposal.proposal.spot,
                  proposal_id: proposal.proposal.id,
                },
              });

              executedTrades.push(updatedTrade);
              executedCount++;
            } catch (error: any) {
              console.error(`Error executing contract for trade ${trade.id}:`, error);
              
              // Log error
              await supabase.from('trade_logs').insert({
                trade_id: trade.id,
                user_id: trade.user_id,
                log_type: 'error',
                message: `Failed to execute contract: ${error.message}`,
                data: { 
                  error: error.message,
                  symbol: trade.symbol,
                  direction: trade.direction,
                },
              });
            }
          } else {
            // Just update current price
            await supabase
              .from('trades')
              .update({ current_price: currentPrice })
              .eq('id', trade.id);
          }
        }
      } catch (error: any) {
        console.error(`Error processing trades for ${symbol}:`, error);
      }
    }

    // Update active trades PNL
    const { data: activeTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'active');

    if (activeTrades) {
      for (const trade of activeTrades) {
        try {
          const priceData = await getCurrentPrice(trade.symbol);
          if (priceData) {
            const currentPrice = priceData.price;
            let pnl = 0;
            let pnlPercentage = 0;

            if (trade.direction === 'long') {
              pnl = (currentPrice - trade.entry_price) * trade.lot_size * trade.number_of_positions;
              pnlPercentage = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
            } else {
              pnl = (trade.entry_price - currentPrice) * trade.lot_size * trade.number_of_positions;
              pnlPercentage = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
            }

            // Check stop loss and target
            let shouldClose = false;
            let closeReason = '';

            if (trade.stop_loss && trade.direction === 'long' && currentPrice <= trade.stop_loss) {
              shouldClose = true;
              closeReason = 'Stop loss hit';
            } else if (trade.stop_loss && trade.direction === 'short' && currentPrice >= trade.stop_loss) {
              shouldClose = true;
              closeReason = 'Stop loss hit';
            } else if (trade.target_price && trade.direction === 'long' && currentPrice >= trade.target_price) {
              shouldClose = true;
              closeReason = 'Target reached';
            } else if (trade.target_price && trade.direction === 'short' && currentPrice <= trade.target_price) {
              shouldClose = true;
              closeReason = 'Target reached';
            }

            if (shouldClose) {
              // If contract exists, sell it via Deriv API
              if (trade.contract_id) {
                try {
                  const sellResult = await sellContract(trade.contract_id, 0); // 0 = sell at market
                  
                  // Update trade with sell info
                  await supabase
                    .from('trades')
                    .update({
                      status: 'closed',
                      close_price: sellResult.sell_price,
                      current_price: sellResult.sell_price,
                      pnl: sellResult.profit,
                      pnl_percentage: pnlPercentage,
                      close_reason: closeReason,
                      closed_at: new Date().toISOString(),
                      contract_sell_time: new Date().toISOString(),
                    })
                    .eq('id', trade.id);

                  // Log closure with contract sell info
                  await supabase.from('trade_logs').insert({
                    trade_id: trade.id,
                    user_id: trade.user_id,
                    log_type: 'trade_closed',
                    message: `Contract sold: ${closeReason}`,
                    data: {
                      contract_id: trade.contract_id,
                      sell_price: sellResult.sell_price,
                      profit: sellResult.profit,
                      pnl_percentage: pnlPercentage,
                      close_reason: closeReason,
                    },
                  });
                } catch (sellError: any) {
                  console.error(`Error selling contract ${trade.contract_id}:`, sellError);
                  
                  // Still close the trade even if sell fails
                  await supabase
                    .from('trades')
                    .update({
                      status: 'closed',
                      close_price: currentPrice,
                      current_price: currentPrice,
                      pnl: pnl,
                      pnl_percentage: pnlPercentage,
                      close_reason: `${closeReason} (sell failed: ${sellError.message})`,
                      closed_at: new Date().toISOString(),
                    })
                    .eq('id', trade.id);

                  // Log error
                  await supabase.from('trade_logs').insert({
                    trade_id: trade.id,
                    user_id: trade.user_id,
                    log_type: 'error',
                    message: `Failed to sell contract: ${sellError.message}`,
                    data: { contract_id: trade.contract_id, error: sellError.message },
                  });
                }
              } else {
                // No contract to sell, just close the trade record
                await supabase
                  .from('trades')
                  .update({
                    status: 'closed',
                    close_price: currentPrice,
                    current_price: currentPrice,
                    pnl: pnl,
                    pnl_percentage: pnlPercentage,
                    close_reason: closeReason,
                    closed_at: new Date().toISOString(),
                  })
                  .eq('id', trade.id);

                // Log closure
                await supabase.from('trade_logs').insert({
                  trade_id: trade.id,
                  user_id: trade.user_id,
                  log_type: 'trade_closed',
                  message: `Trade closed: ${closeReason}`,
                  data: {
                    close_price: currentPrice,
                    pnl: pnl,
                    pnl_percentage: pnlPercentage,
                    close_reason: closeReason,
                  },
                });
              }

              // Create cooldown if loss
              if (pnl < 0) {
                const endsAt = new Date();
                endsAt.setMinutes(endsAt.getMinutes() + 13);

                await supabase.from('cooldown_periods').insert({
                  user_id: trade.user_id,
                  trade_id: trade.id,
                  cooldown_type: 'loss',
                  started_at: new Date().toISOString(),
                  ends_at: endsAt.toISOString(),
                  is_active: true,
                });
              } else if (pnl > 0) {
                const endsAt = new Date();
                endsAt.setMinutes(endsAt.getMinutes() + 10);

                await supabase.from('cooldown_periods').insert({
                  user_id: trade.user_id,
                  trade_id: trade.id,
                  cooldown_type: 'win',
                  started_at: new Date().toISOString(),
                  ends_at: endsAt.toISOString(),
                  is_active: true,
                });
              }
            } else {
              // Just update PNL
              await supabase
                .from('trades')
                .update({
                  current_price: currentPrice,
                  pnl: pnl,
                  pnl_percentage: pnlPercentage,
                })
                .eq('id', trade.id);
            }
          }
        } catch (error) {
          console.error(`Error updating trade ${trade.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      executed: executedCount,
      executed_trades: executedTrades,
      message: `Monitored ${pendingTrades.length} pending trades, executed ${executedCount}`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/trades/monitor:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
