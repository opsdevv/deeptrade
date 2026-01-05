import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAccountList } from '@/lib/api/deriv';
import { loginToDerivAccount } from '@/lib/api/deriv-auth';

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

    // Get user's stored Deriv account credentials
    const { data: accounts, error: accountsError } = await supabase
      .from('deriv_accounts')
      .select('id, login_id, password, server, account_name')
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
        { error: 'No active Deriv account found. Please add a Deriv account in Settings first.' },
        { status: 404 }
      );
    }

    const storedAccount = accounts[0];

    // Verify credentials work first
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

    // Get account list from Deriv API using credentials in "login:password" format
    try {
      const authToken = `${storedAccount.login_id}:${storedAccount.password}`;
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
