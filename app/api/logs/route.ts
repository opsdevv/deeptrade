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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logs/route.ts:15',message:'Before getUser call',data:{hasSupabase:!!supabase,method:'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logs/route.ts:20',message:'After getUser call',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (userError || !user) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logs/route.ts:23',message:'Returning 401 Unauthorized',data:{userError:userError?.message,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');
    const logType = searchParams.get('log_type');
    const search = searchParams.get('search');

    let query = supabase
      .from('trade_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (logType && logType !== 'all') {
      query = query.eq('log_type', logType);
    }

    if (search) {
      query = query.ilike('message', `%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('Error fetching logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch logs' },
        { status: 500 }
      );
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 1;

    return NextResponse.json({
      success: true,
      logs: logs || [],
      page,
      page_size: pageSize,
      total_pages: totalPages,
      total_count: count || 0,
      });
  } catch (error: any) {
    console.error('Error in GET /api/logs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
