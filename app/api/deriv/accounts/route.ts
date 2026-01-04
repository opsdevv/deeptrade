import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAccountList } from '@/lib/api/deriv';
import { loginToDerivAccount } from '@/lib/api/deriv-auth';

export async function GET(request: NextRequest) {
  try {
    // #region agent log
    const cookieHeader = request.headers.get('cookie');
    const allCookies = request.cookies.getAll();
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:6',message:'GET /api/deriv/accounts entry',data:{hasCookieHeader:!!cookieHeader,cookieHeaderLength:cookieHeader?.length||0,cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name),hasSupabaseCookies:allCookies.some(c=>c.name.includes('supabase')||c.name.includes('sb-'))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    const response = new NextResponse();
    const supabase = createServerClient(request, response);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:10',message:'createServerClient completed',data:{hasSupabase:!!supabase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get current user - try getSession first if getUser fails
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:25',message:'Before getUser call',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    let { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // If getUser fails with "Auth session missing!", try getSession as fallback
    if (userError && userError.message === 'Auth session missing!') {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:32',message:'getUser failed, trying getSession',data:{errorMessage:userError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H7'})}).catch(()=>{});
      // #endregion
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:36',message:'getSession result',data:{hasSession:!!session,hasError:!!sessionError,errorMessage:sessionError?.message,hasUser:!!session?.user,userId:session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H7'})}).catch(()=>{});
      // #endregion
      if (session && !sessionError && session.user) {
        user = session.user;
        userError = null;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:41',message:'getSession succeeded, user set',data:{hasUser:!!user,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:45',message:'getSession also failed',data:{hasSession:!!session,hasError:!!sessionError,errorMessage:sessionError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/deriv/accounts/route.ts:40',message:'Final auth check',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    
    // If no user is authenticated, return empty accounts list instead of error
    if (userError || !user) {
      return NextResponse.json({
        success: true,
        accounts: [],
      }, {
        headers: response.headers,
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
      }, {
        headers: response.headers,
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
