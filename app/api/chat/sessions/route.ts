import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// GET: Fetch all chat sessions (grouped by session_id)
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get all unique sessions with their first message and metadata
    const { data: sessions, error } = await supabase
      .from('chat_messages')
      .select('session_id, symbol, created_at, content')
      .not('session_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    // Group by session_id and get the first message for each session
    const sessionMap = new Map<string, {
      session_id: string;
      symbol: string | null;
      created_at: string;
      preview: string;
      message_count: number;
    }>();

    sessions?.forEach((msg) => {
      if (!msg.session_id) return;
      
      const existing = sessionMap.get(msg.session_id);
      if (!existing) {
        // First message in this session (most recent due to DESC order)
        sessionMap.set(msg.session_id, {
          session_id: msg.session_id,
          symbol: msg.symbol,
          created_at: msg.created_at,
          preview: msg.content?.substring(0, 100) || 'New chat',
          message_count: 1,
        });
      } else {
        // Increment message count
        existing.message_count++;
      }
    });

    const sessionList = Array.from(sessionMap.values());

    return NextResponse.json({
      success: true,
      sessions: sessionList,
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/sessions:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a chat session
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id parameter' },
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

    // Delete all messages with this session_id
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error deleting session:', error);
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/chat/sessions:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
