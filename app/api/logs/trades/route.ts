import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');
    const status = searchParams.get('status'); // Optional status filter

    // Get selected account if available
    const { data: selectedAccount } = await supabase
      .from('deriv_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_selected', true)
      .single();

    let query = supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (selectedAccount) {
      query = query.eq('deriv_account_id', selectedAccount.id);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: trades, error, count } = await query;

    if (error) {
      console.error('Error fetching trades:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trades' },
        { status: 500 }
      );
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 1;

    return NextResponse.json({
      success: true,
      trades: trades || [],
      page,
      page_size: pageSize,
      total_pages: totalPages,
      total_count: count || 0,
    });
  } catch (error: any) {
    console.error('Error in GET /api/logs/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
