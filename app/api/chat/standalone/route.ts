import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { callDeepSeekAPI } from '@/lib/api/deepseek';
import { getAvailableInstruments } from '@/lib/api/deriv';
import { analyze } from '@/lib/analysis/engine';
import { fetchMarketData } from '@/lib/api/deriv';

export async function GET(request: NextRequest) {
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

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/standalone:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:55',message:'POST /api/chat/standalone entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H3'})}).catch(()=>{});
    // #endregion
    const body = await request.json();
    const { session_id, message, screenshot_url, symbol, run_analysis } = body;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:59',message:'Request body parsed',data:{hasSessionId:!!session_id,hasMessage:!!message,hasScreenshot:!!screenshot_url,hasSymbol:!!symbol,runAnalysis:!!run_analysis},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H3'})}).catch(()=>{});
    // #endregion

    if (!session_id) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400 }
      );
    }

    if (!message && !screenshot_url) {
      return NextResponse.json(
        { error: 'Message or screenshot required' },
        { status: 400 }
      );
    }

    let supabase;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:74',message:'Attempting to create Supabase client',data:{hasServiceRoleKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      supabase = createServerClient();
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:75',message:'Supabase client created successfully',data:{clientExists:!!supabase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } catch (clientError: any) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:75',message:'Supabase client creation failed',data:{error:clientError?.message,errorStack:clientError?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Database not configured', success: false },
        { status: 500 }
      );
    }
    if (!supabase) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:80',message:'Supabase client is null',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Database not configured', success: false },
        { status: 500 }
      );
    }

    // Helper function to convert relative URLs to absolute
    const getAbsoluteUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:3000';
      const protocol = origin.includes('localhost') ? 'http' : 'https';
      const host = origin.replace(/^https?:\/\//, '');
      return `${protocol}://${host}${url.startsWith('/') ? url : '/' + url}`;
    };

    // Save user message
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:95',message:'Before database insert',data:{sessionId,symbol:symbol||null,hasMessage:!!message,hasScreenshot:!!screenshot_url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H4'})}).catch(()=>{});
    // #endregion
    const { data: userMessage, error: userError } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        symbol: symbol || null,
        role: 'user',
        content: message || (screenshot_url ? 'Please analyze this screenshot.' : ''),
        screenshot_url: screenshot_url || null,
      })
      .select()
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:105',message:'After database insert',data:{hasUserMessage:!!userMessage,hasError:!!userError,errorCode:userError?.code,errorMessage:userError?.message,errorDetails:userError?.details,errorHint:userError?.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H4'})}).catch(()=>{});
    // #endregion

    if (userError) {
      console.error('Error saving user message:', userError);
      const errorResponse = { error: 'Failed to save message', success: false };
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:110',message:'Returning error response',data:{response:errorResponse,statusCode:500},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H3,H4'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        errorResponse,
        { status: 500 }
      );
    }

    // Get conversation history
    const { data: history, error: historyError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Error fetching history:', historyError);
    }

    // Run analysis if requested and symbol is provided
    let analysisResult = null;
    if (run_analysis && symbol) {
      try {
        // Fetch market data for all timeframes
        const [data2h, data15m, data5m] = await Promise.all([
          fetchMarketData(symbol, '2h', 200),
          fetchMarketData(symbol, '15m', 200),
          fetchMarketData(symbol, '5m', 200),
        ]);

        // Run analysis
        analysisResult = analyze(symbol, {
          '2h': data2h,
          '15m': data15m,
          '5m': data5m,
        });
      } catch (analysisError: any) {
        console.error('Error running analysis:', analysisError);
        // Continue without analysis - user can still chat
      }
    }

    // Build conversation messages for DeepSeek
    const messages: Array<{ 
      role: string; 
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> 
    }> = [];

    // System message with trading context
    let systemPrompt = `You are an expert trading analysis assistant specializing in ICT (Inner Circle Trader) and SMC (Smart Money Concepts) methodologies. You help traders analyze market conditions, identify trading opportunities, and understand price action.

Your expertise includes:
- Liquidity sweeps and market structure
- Premium/Discount zones
- Fair Value Gaps (FVGs)
- Market Structure Shifts (MSS)
- Order blocks and displacement
- Session-based trading (London, New York, Asian sessions)
- Multi-timeframe analysis (2H, 15m, 5m)

You can analyze any trading symbol available on Deriv. When a user asks about a symbol, you can provide insights based on ICT/SMC principles.`;

    if (symbol) {
      systemPrompt += `\n\nCurrent Symbol: ${symbol}`;
    }

    if (analysisResult) {
      systemPrompt += `\n\nRecent Analysis Results:
- Final Decision: ${analysisResult.final_decision}
- 2H Bias: ${analysisResult.timeframe_2h.bias}
- 5M Direction: ${analysisResult.timeframe_5m.direction || 'N/A'}
- Confidence: ${analysisResult.timeframe_5m.confidence}`;
    }

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history
    if (history && history.length > 0) {
      history.forEach((msg) => {
        const absoluteScreenshotUrl = getAbsoluteUrl(msg.screenshot_url);
        if (absoluteScreenshotUrl) {
          // For DeepSeek vision API, we'll use the image_url format
          messages.push({
            role: msg.role,
            content: [
              {
                type: 'text',
                text: msg.content || '',
              },
              {
                type: 'image_url',
                image_url: { url: absoluteScreenshotUrl },
              },
            ],
          });
        } else {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      });
    }

    // Add current user message
    const absoluteScreenshotUrl = getAbsoluteUrl(screenshot_url);
    if (absoluteScreenshotUrl) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: message || 'Please analyze this screenshot.',
          },
          {
            type: 'image_url',
            image_url: { url: absoluteScreenshotUrl },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: message,
      });
    }

    // Call DeepSeek API
    let assistantResponse = 'I apologize, but I encountered an error processing your request.';
    try {
      const deepseekResponse = await callDeepSeekAPI(messages, 'deepseek-chat');
      assistantResponse = deepseekResponse.choices[0]?.message?.content || assistantResponse;
    } catch (apiError: any) {
      console.error('Error calling DeepSeek API:', apiError);
      assistantResponse = `Error: ${apiError.message}. Please check your DeepSeek API configuration.`;
    }

    // Save assistant response
    const { data: assistantMessage, error: assistantError } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        symbol: symbol || null,
        role: 'assistant',
        content: assistantResponse,
      })
      .select()
      .single();

    if (assistantError) {
      console.error('Error saving assistant message:', assistantError);
    }

    // Return both messages and analysis if available
    const successResponse = {
      success: true,
      messages: [userMessage, assistantMessage].filter(Boolean),
      analysis: analysisResult,
    };
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:264',message:'Returning success response',data:{response:successResponse,messageCount:successResponse.messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(successResponse);
  } catch (error: any) {
    console.error('Error in POST /api/chat/standalone:', error);
    const errorResponse = { error: error.message || 'Internal server error', success: false };
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:270',message:'Caught exception in POST handler',data:{error:error?.message,errorStack:error?.stack,response:errorResponse},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2,H5'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      errorResponse,
      { status: 500 }
    );
  }
}
