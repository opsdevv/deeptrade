import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Supabase auth error:', userError);
      return NextResponse.json(
        { 
          error: 'Authentication failed. Please make sure you are logged in.',
          details: userError.message 
        },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { 
          error: 'You must be logged in to view MT5 accounts. Please log in and try again.' 
        },
        { status: 401 }
      );
    }

    const { data: accounts, error } = await supabase
      .from('mt5_accounts')
      .select('id, account_name, broker, server, login_id, account_type, account_id, balance, currency, is_active, is_selected, last_login_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch accounts' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accounts: accounts || [],
    }, {
    });
  } catch (error: any) {
    console.error('Error in GET /api/mt5/accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_name, broker, server, login_id, password, account_type, account_id } = body;

    if (!account_name || !broker || !server || !login_id) {
      return NextResponse.json(
        { error: 'Account name, broker, server, and login ID are required' },
        { status: 400 }
      );
    }

    if (!account_type || !['real', 'demo'].includes(account_type)) {
      return NextResponse.json(
        { error: 'Account type must be "real" or "demo"' },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Supabase auth error:', userError);
      return NextResponse.json(
        { 
          error: 'Authentication failed. Please make sure you are logged in.',
          details: userError.message 
        },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { 
          error: 'You must be logged in to add MT5 accounts. Please log in and try again.' 
        },
        { status: 401 }
      );
    }

    // If updating and password is not provided, get existing password
    let existingPassword = password;
    if (account_id && !password) {
      const { data: existingAccount } = await supabase
        .from('mt5_accounts')
        .select('password')
        .eq('id', account_id)
        .eq('user_id', user.id)
        .single();
      
      if (existingAccount) {
        existingPassword = existingAccount.password;
      } else {
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 404 }
        );
      }
    }

    // Prepare account data
    const accountData: any = {
      user_id: user.id,
      account_name: account_name,
      broker: broker,
      server: server,
      login_id: login_id,
      account_type: account_type,
      is_active: true,
      last_login_at: new Date().toISOString(),
    };

    // Only update password if provided
    if (password) {
      accountData.password = password; // In production, encrypt this
    } else if (existingPassword) {
      accountData.password = existingPassword;
    }

    // Set account_id (typically same as login_id for MT5)
    accountData.account_id = login_id;

    if (account_id) {
      // Update existing account
      const { data: updatedAccount, error: updateError } = await supabase
        .from('mt5_accounts')
        .update(accountData)
        .eq('id', account_id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update account' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        account: updatedAccount,
        message: 'MT5 account updated successfully',
      });
    } else {
      // Create new account - unselect all other accounts for this user
      await supabase
        .from('mt5_accounts')
        .update({ is_selected: false })
        .eq('user_id', user.id);

      // Create new account (set as selected by default)
      const { data: newAccount, error: createError } = await supabase
        .from('mt5_accounts')
        .insert({
          ...accountData,
          is_selected: true,
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create account' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        account: newAccount,
        message: 'MT5 account added successfully',
      });
    }
  } catch (error: any) {
    console.error('Error in POST /api/mt5/accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Select/switch account
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_id } = body;

    if (!account_id) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Supabase auth error:', userError);
      return NextResponse.json(
        { 
          error: 'Authentication failed. Please make sure you are logged in.',
          details: userError.message 
        },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { 
          error: 'You must be logged in to select MT5 accounts. Please log in and try again.' 
        },
        { status: 401 }
      );
    }

    // Unselect all accounts for this user
    await supabase
      .from('mt5_accounts')
      .update({ is_selected: false })
      .eq('user_id', user.id);

    // Select the specified account
    const { data: selectedAccount, error: selectError } = await supabase
      .from('mt5_accounts')
      .update({ is_selected: true })
      .eq('id', account_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (selectError || !selectedAccount) {
      return NextResponse.json(
        { error: 'Failed to select account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      account: selectedAccount,
      message: 'Account selected successfully',
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/mt5/accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete account
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const account_id = searchParams.get('account_id');

    if (!account_id) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Supabase auth error:', userError);
      return NextResponse.json(
        { 
          error: 'Authentication failed. Please make sure you are logged in.',
          details: userError.message 
        },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { 
          error: 'You must be logged in to delete MT5 accounts. Please log in and try again.' 
        },
        { status: 401 }
      );
    }

    const { error: deleteError } = await supabase
      .from('mt5_accounts')
      .delete()
      .eq('id', account_id)
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/mt5/accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
