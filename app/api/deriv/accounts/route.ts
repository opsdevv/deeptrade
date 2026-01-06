import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAccountList } from '@/lib/api/deriv';
import { loginToDerivAccount } from '@/lib/api/deriv-auth';

export async function GET(request: NextRequest) {
  try {
    // First, try using DERIV_API_KEY from environment variables
    const apiKey = process.env.DERIV_API_KEY;
    
    if (apiKey) {
      try {
        console.log('[API] Attempting to fetch accounts using DERIV_API_KEY');
        const accountList = await getAccountList(apiKey);
        
        return NextResponse.json({
          success: true,
          accounts: accountList,
        });
      } catch (apiKeyError: any) {
        console.warn('[API] Failed to fetch accounts with API key, will try database credentials:', apiKeyError.message);
        // Fall through to try database credentials
      }
    }

    // Fallback to database credentials if API key doesn't work or isn't available
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Database not configured and DERIV_API_KEY failed. Please configure either DERIV_API_KEY in environment variables or add a Deriv account in Settings.' },
        { status: 500 }
      );
    }

    // Get current user - try getSession first if getUser fails
    let { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // If getUser fails with "Auth session missing!", try getSession as fallback
    if (userError && userError.message === 'Auth session missing!') {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (session && !sessionError && session.user) {
        user = session.user;
        userError = null;
      }
    }
    
    // If no user is authenticated, return empty accounts list instead of error
    if (userError || !user) {
      return NextResponse.json({
        success: true,
        accounts: [],
      });
    }

    // Get user's stored Deriv account credentials with API tokens
    const { data: accounts, error: accountsError } = await supabase
      .from('deriv_accounts')
      .select('id, login_id, password, server, account_name, api_token')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('is_selected', { ascending: false })
      .limit(1);

    if (accountsError) {
      console.error('Error fetching stored accounts:', accountsError);
      return NextResponse.json(
        { error: `Database error: ${accountsError.message || 'Failed to fetch stored accounts'}` },
        { status: 500 }
      );
    }
    
    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No accounts found. Please configure DERIV_API_KEY in environment variables or add a Deriv account in Settings.' },
        { status: 404 }
      );
    }

    const storedAccount = accounts[0];

    // Prefer API token if available, otherwise use login:password
    let authToken: string;
    if (storedAccount.api_token) {
      authToken = storedAccount.api_token;
      console.log('[API] Using account-specific API token');
    } else {
      // Verify credentials work first if using password auth
      try {
        const loginResult = await loginToDerivAccount({
          login: storedAccount.login_id,
          password: storedAccount.password,
          server: storedAccount.server,
        });

        if (!loginResult.success) {
          return NextResponse.json(
            { error: `Deriv authentication failed: ${loginResult.error || 'Invalid credentials. Please check your account settings.'}` },
            { status: 401 }
          );
        }
      } catch (loginError: any) {
        console.error('Deriv login error:', loginError);
        return NextResponse.json(
          { error: `Deriv login failed: ${loginError.message || 'Unable to connect to Deriv. Please try again later.'}` },
          { status: 401 }
        );
      }
      authToken = `${storedAccount.login_id}:${storedAccount.password}`;
    }

    // Get account list from Deriv API
    try {
      const accountList = await getAccountList(authToken);
      
      return NextResponse.json({
        success: true,
        accounts: accountList,
      });
    } catch (accountListError: any) {
      console.error('Account list error:', accountListError);
      return NextResponse.json(
        { error: `Failed to fetch account list from Deriv: ${accountListError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in GET /api/deriv/accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
