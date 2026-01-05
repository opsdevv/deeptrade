import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { loginToDerivAccount } from '@/lib/api/deriv-auth';

export async function POST(request: NextRequest) {
  try {
    // #region agent log
    const cookieHeaders = request.headers.get('cookie');
    const allCookies = request.cookies.getAll();
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:5',message:'POST handler entry',data:{method:'POST',hasCookieHeader:!!cookieHeaders,cookieHeaderLength:cookieHeaders?.length||0,cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name),hasSupabaseCookies:allCookies.some(c=>c.name.includes('supabase')||c.name.includes('sb-'))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    const body = await request.json();
    const { account_name, broker, server, login_id, password, account_type, account_id, api_token } = body;

    if (!account_name || !broker || !server || !login_id || !password) {
      return NextResponse.json(
        { error: 'Account name, broker, server, login ID, and password are required' },
        { status: 400 }
      );
    }

    if (!account_type || !['real', 'demo'].includes(account_type)) {
      return NextResponse.json(
        { error: 'Account type must be "real" or "demo"' },
        { status: 400 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:24',message:'Before createServerClient call',data:{hasRequest:!!request,hasResponse:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const response = new NextResponse();
    const supabase = createServerClient(request, response);
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

    // If updating and password is not provided, get existing password
    let existingPassword = password;
    if (account_id && !password) {
      const { data: existingAccount } = await supabase
        .from('deriv_accounts')
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

    // Test login credentials (only if password is provided or we're creating new)
    let loginResult;
    if (password || !account_id) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:61',message:'Before loginToDerivAccount in POST',data:{hasLoginId:!!login_id,hasPassword:!!password,hasExistingPassword:!!existingPassword,hasServer:!!server},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      try {
        loginResult = await loginToDerivAccount({
          login: login_id,
          password: password || existingPassword,
          server: server,
        });
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:68',message:'After loginToDerivAccount in POST',data:{success:loginResult.success,hasError:!!loginResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
      } catch (loginError: any) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:70',message:'Exception in loginToDerivAccount POST',data:{errorMessage:loginError.message,errorStack:loginError.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return NextResponse.json(
          { error: `Login failed: ${loginError.message}` },
          { status: 400 }
        );
      }

      if (!loginResult.success) {
        return NextResponse.json(
          { error: loginResult.error || 'Invalid credentials' },
          { status: 400 }
        );
      }
    }

    // Create or update account
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
    }

    // Store API token if provided (for trading operations)
    if (api_token) {
      accountData.api_token = api_token; // In production, encrypt this
    }

    // Update account info from login result if available
    if (loginResult) {
      accountData.account_id = loginResult.account_id || account_id;
      accountData.balance = loginResult.balance;
      accountData.currency = loginResult.currency || 'USD';
    }

    if (account_id) {
      // Update existing account
      const { data: updatedAccount, error: updateError } = await supabase
        .from('deriv_accounts')
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
        message: 'Deriv account updated successfully',
      }, {
        headers: response.headers,
      });
    } else {
      // Create new account - unselect all other accounts for this user
      await supabase
        .from('deriv_accounts')
        .update({ is_selected: false })
        .eq('user_id', user.id);

      // Create new account (set as selected by default)
      const { data: newAccount, error: createError } = await supabase
        .from('deriv_accounts')
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
        message: 'Deriv account connected successfully',
      }, {
        headers: response.headers,
      });
    }
  } catch (error: any) {
    console.error('Error in POST /api/deriv/auth:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const cookieHeaders = request.headers.get('cookie');
    const allCookies = request.cookies.getAll();
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:181',message:'Before getUser call in GET',data:{hasSupabase:!!supabase,method:'GET',cookieHeader:cookieHeaders?.substring(0,100),cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:189',message:'After getUser call in GET',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message,errorCode:userError?.status,userId:user?.id,userEmail:user?.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (userError || !user) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/auth/route.ts:189',message:'Returning 401 Unauthorized in GET',data:{userError:userError?.message,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: accounts, error } = await supabase
      .from('deriv_accounts')
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
      headers: response.headers,
    });
  } catch (error: any) {
    console.error('Error in GET /api/deriv/auth:', error);
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

    const response = new NextResponse();
    const supabase = createServerClient(request, response);
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

    // Unselect all accounts for this user
    await supabase
      .from('deriv_accounts')
      .update({ is_selected: false })
      .eq('user_id', user.id);

    // Select the specified account
    const { data: selectedAccount, error: selectError } = await supabase
      .from('deriv_accounts')
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
    console.error('Error in PATCH /api/deriv/auth:', error);
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

    const response = new NextResponse();
    const supabase = createServerClient(request, response);
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

    const { error: deleteError } = await supabase
      .from('deriv_accounts')
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
    console.error('Error in DELETE /api/deriv/auth:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
