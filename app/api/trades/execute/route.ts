import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { 
  getContractProposal, 
  buyContract, 
  getContractType 
} from '@/lib/api/deriv';

/**
 * Execute a trade immediately (when entry is confirmed via WebSocket)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      symbol, 
      direction, 
      entry_price, 
      stop_loss, 
      target_price, 
      lot_size = 1, 
      number_of_positions = 1,
      account_id 
    } = body;

    if (!symbol || !direction || !entry_price) {
      return NextResponse.json(
        { error: 'Symbol, direction, and entry_price are required' },
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

    // Try to find Deriv account in database (if using stored credentials)
    // When using API key directly, we may not have deriv_accounts records
    let derivAccount: any = null;
    
    if (account_id) {
      // Try to find by login_id (Deriv account ID)
      const { data: account } = await supabase
        .from('deriv_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('login_id', account_id)
        .single();
      
      if (account) {
        derivAccount = account;
      }
    }

    // If no account found, try to get selected account
    if (!derivAccount) {
      const { data: selectedAccount } = await supabase
        .from('deriv_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_selected', true)
        .single();
      
      derivAccount = selectedAccount;
    }

    // If no account in database, create a minimal account object for API key usage
    // The account_id will be stored for reference, but we'll use API key from env
    if (!derivAccount) {
      // Use API key directly - create a temporary account record for trade tracking
      derivAccount = {
        id: null, // Will create account record if needed
        account_id: account_id || 'API_KEY_ACCOUNT',
        currency: 'USD',
      };
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

    try {
      // Determine contract type based on symbol and direction
      const contractType = getContractType(symbol, direction);
      
      // Get contract proposal
      const proposal = await getContractProposal({
        amount: lot_size,
        basis: 'stake',
        contract_type: contractType,
        currency: derivAccount.currency || 'USD',
        duration: 5, // 5 minutes - adjust as needed
        duration_unit: 'm',
        symbol: symbol,
      });

      // Buy contract
      const contract = await buyContract(
        proposal.proposal.id,
        proposal.proposal.ask_price
      );

      // Create trade record
      const tradeData: any = {
        user_id: user.id,
        symbol: symbol,
        direction: direction,
        entry_price: proposal.proposal.spot || entry_price,
        stop_loss: stop_loss,
        target_price: target_price,
        lot_size: lot_size,
        number_of_positions: number_of_positions,
        current_price: proposal.proposal.spot || entry_price,
        status: 'active',
        contract_id: contract.contract_id,
        contract_type: contractType,
        contract_amount: lot_size,
        contract_duration: 5 * 60, // 5 minutes in seconds
        contract_purchase_time: new Date().toISOString(),
        setup_data: {
          executed_via_websocket: true,
          executed_at: new Date().toISOString(),
          account_id: String(account_id || derivAccount?.account_id || derivAccount?.login_id || ''),
        },
      };

      // Only include deriv_account_id if we have a database record
      if (derivAccount && derivAccount.id) {
        tradeData.deriv_account_id = derivAccount.id;
      }

      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert(tradeData)
        .select()
        .single();

      if (tradeError) {
        console.error('Error creating trade:', tradeError);
        return NextResponse.json(
          { error: 'Failed to create trade record' },
          { status: 500 }
        );
      }

      // Log trade execution
      await supabase.from('trade_logs').insert({
        trade_id: trade.id,
        user_id: user.id,
        log_type: 'trade_executed',
        message: `Trade executed via WebSocket: ${symbol} ${direction} at ${proposal.proposal.spot}`,
        data: {
          contract_id: contract.contract_id,
          contract_type: contractType,
          buy_price: contract.buy_price,
          spot_price: proposal.proposal.spot,
          proposal_id: proposal.proposal.id,
          executed_via_websocket: true,
        },
      });

      return NextResponse.json({
        success: true,
        trade: trade,
        message: 'Trade executed successfully',
      });
    } catch (execError: any) {
      console.error('Error executing contract:', execError);
      return NextResponse.json(
        { error: `Failed to execute contract: ${execError.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in POST /api/trades/execute:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
