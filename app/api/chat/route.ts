import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { callDeepSeekAPI } from '@/lib/api/deepseek';
import { getCurrentPrice, fetchMarketData } from '@/lib/api/deriv';
import { checkRateLimit, RateLimits } from '@/lib/redis/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const runId = searchParams.get('run_id');

    if (!runId) {
      return NextResponse.json(
        { error: 'Missing run_id parameter' },
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
      .eq('analysis_run_id', runId)
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
    console.error('Error in GET /api/chat:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting for chat (DeepSeek API calls)
    const clientId = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const rateLimit = await checkRateLimit('chat', {
      ...RateLimits.chat,
      identifier: clientId,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait before sending another message.',
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RateLimits.chat.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
          },
        }
      );
    }

    const body = await request.json();
    const { run_id, message, screenshot_url, analysis_data } = body;

    if (!run_id) {
      return NextResponse.json(
        { error: 'Missing run_id' },
        { status: 400 }
      );
    }

    if (!message && !screenshot_url) {
      return NextResponse.json(
        { error: 'Message or screenshot required' },
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

    // Verify analysis run exists
    const { data: analysisRun, error: runError } = await supabase
      .from('analysis_runs')
      .select('id, instruments!inner(symbol)')
      .eq('id', run_id)
      .single();

    if (runError || !analysisRun) {
      return NextResponse.json(
        { error: 'Analysis run not found' },
        { status: 404 }
      );
    }

    // Save user message
    const { data: userMessage, error: userError } = await supabase
      .from('chat_messages')
      .insert({
        analysis_run_id: run_id,
        role: 'user',
        content: message || (screenshot_url ? 'Please analyze this screenshot along with the analysis data.' : ''),
        screenshot_url: screenshot_url || null,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error saving user message:', userError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    // Get conversation history
    const { data: history, error: historyError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('analysis_run_id', run_id)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Error fetching history:', historyError);
    }

    // Get analysis data if not provided
    let analysisResult = analysis_data;
    const instrumentSymbol = (analysisRun.instruments as any)?.symbol || null;
    
    if (!analysisResult) {
      const { data: runData } = await supabase
        .from('analysis_runs')
        .select(`
          id,
          instruments!inner(symbol),
          analysis_results(timeframe, result_data),
          trade_signals(signal_type, direction, entry_zone, stop_level, target_zone, confidence, signal_data)
        `)
        .eq('id', run_id)
        .single();

      if (runData) {
        const instrument = (runData.instruments as any)?.symbol || 'UNKNOWN';
        const results = (runData.analysis_results as any[]) || [];
        const signal = (runData.trade_signals as any[])?.[0];

        analysisResult = {
          instrument,
          timeframe_2h: results.find((r) => r.timeframe === '2h')?.result_data || {},
          timeframe_15m: results.find((r) => r.timeframe === '15m')?.result_data || {},
          timeframe_5m: results.find((r) => r.timeframe === '5m')?.result_data || {},
          final_decision: signal?.signal_type || 'NO_TRADE',
        };
      }
    }

    // ALWAYS fetch latest data from Deriv API before responding
    let currentPriceData = null;
    let latestMarketData = null;
    
    if (instrumentSymbol) {
      try {
        // Fetch current price
        currentPriceData = await getCurrentPrice(instrumentSymbol);
        if (currentPriceData) {
          console.log(`[INFO] Fetched current price for ${instrumentSymbol}: ${currentPriceData.price}`);
        }
        
        // Fetch latest market data for context (just a few recent candles)
        try {
          const [data2h, data15m, data5m] = await Promise.all([
            fetchMarketData(instrumentSymbol, '2h', 10).catch(() => null),
            fetchMarketData(instrumentSymbol, '15m', 10).catch(() => null),
            fetchMarketData(instrumentSymbol, '5m', 10).catch(() => null),
          ]);
          
          if (data2h || data15m || data5m) {
            latestMarketData = {
              '2h': data2h || [],
              '15m': data15m || [],
              '5m': data5m || [],
            };
            console.log(`[INFO] Fetched latest market data for ${instrumentSymbol}`);
          }
        } catch (marketDataError: any) {
          console.warn(`[WARN] Could not fetch latest market data: ${marketDataError.message}`);
          // Continue without market data - not critical
        }
      } catch (priceError: any) {
        console.error(`[ERROR] Error fetching latest data for ${instrumentSymbol}:`, priceError.message);
        // Continue without latest data - not critical, but log the error
      }
    }

    // Helper function to convert relative URLs to absolute
    const getAbsoluteUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // Convert relative URL to absolute using the request origin
      const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:3000';
      const protocol = origin.includes('localhost') ? 'http' : 'https';
      const host = origin.replace(/^https?:\/\//, '');
      return `${protocol}://${host}${url.startsWith('/') ? url : '/' + url}`;
    };

    // Build conversation messages for DeepSeek
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];

    // System message with analysis context
    let systemPrompt = `You are a trading analysis assistant. You are helping analyze an ICT (Inner Circle Trader) scalping analysis.

Analysis Summary:
- Instrument: ${(analysisRun.instruments as any)?.symbol || 'Unknown'}
- Final Decision: ${analysisResult?.final_decision || 'N/A'}
- 2H Bias: ${analysisResult?.timeframe_2h?.bias || 'N/A'}
- 5M Direction: ${analysisResult?.timeframe_5m?.direction || 'N/A'}

You have access to the full analysis data. Answer questions about the analysis, provide insights, and help with further analysis. If a screenshot is provided, analyze it in conjunction with the analysis data.`;

    // Add latest price data if available
    if (currentPriceData) {
      const priceInfo = currentPriceData.bid && currentPriceData.ask
        ? `Current Price: ${currentPriceData.price} (Bid: ${currentPriceData.bid}, Ask: ${currentPriceData.ask})`
        : `Current Price: ${currentPriceData.price}`;
      const priceTime = new Date(currentPriceData.timestamp * 1000).toISOString();
      
      systemPrompt += `\n\nLIVE PRICE DATA (fetched just now from Deriv API):
- Symbol: ${currentPriceData.symbol}
- ${priceInfo}
- Timestamp: ${priceTime}

You MUST use this actual current price when discussing the symbol. This is real-time data from the Deriv API.`;
    }

    // Add latest market data context if available
    if (latestMarketData) {
      const latest2h = latestMarketData['2h']?.[latestMarketData['2h'].length - 1];
      const latest15m = latestMarketData['15m']?.[latestMarketData['15m'].length - 1];
      const latest5m = latestMarketData['5m']?.[latestMarketData['5m'].length - 1];
      
      systemPrompt += `\n\nLATEST MARKET DATA (fetched just now from Deriv API):`;
      if (latest2h) {
        systemPrompt += `\n- 2H: Latest candle - Open: ${latest2h.open}, High: ${latest2h.high}, Low: ${latest2h.low}, Close: ${latest2h.close}`;
      }
      if (latest15m) {
        systemPrompt += `\n- 15M: Latest candle - Open: ${latest15m.open}, High: ${latest15m.high}, Low: ${latest15m.low}, Close: ${latest15m.close}`;
      }
      if (latest5m) {
        systemPrompt += `\n- 5M: Latest candle - Open: ${latest5m.open}, High: ${latest5m.high}, Low: ${latest5m.low}, Close: ${latest5m.close}`;
      }
      systemPrompt += `\n\nUse this latest market data to provide up-to-date analysis and insights.`;
    }

    systemPrompt += `\n\nIMPORTANT: The system automatically fetches the latest data from the Deriv API before each response. Always use the most recent data provided above when answering questions about current prices, market conditions, or recent price action.`;

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history
    if (history && history.length > 0) {
      history.forEach((msg) => {
        const absoluteScreenshotUrl = getAbsoluteUrl(msg.screenshot_url);
        if (absoluteScreenshotUrl) {
          // Include image in message if URL is available
          // Note: DeepSeek may not support vision, so we'll include it in text as well
          messages.push({
            role: msg.role,
            content: msg.content + (msg.content ? '\n\n[Screenshot attached: ' + absoluteScreenshotUrl + ']' : '[Screenshot: ' + absoluteScreenshotUrl + ']'),
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
        content: (message || 'Please analyze this screenshot along with the analysis data.') + '\n\n[Screenshot attached: ' + absoluteScreenshotUrl + ']',
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
      const deepseekResponse = await callDeepSeekAPI(messages);
      assistantResponse = deepseekResponse.choices[0]?.message?.content || assistantResponse;
    } catch (apiError: any) {
      console.error('Error calling DeepSeek API:', apiError);
      assistantResponse = `Error: ${apiError.message}. Please check your DeepSeek API configuration.`;
    }

    // Save assistant response
    const { data: assistantMessage, error: assistantError } = await supabase
      .from('chat_messages')
      .insert({
        analysis_run_id: run_id,
        role: 'assistant',
        content: assistantResponse,
      })
      .select()
      .single();

    if (assistantError) {
      console.error('Error saving assistant message:', assistantError);
    }

    // Return both messages
    return NextResponse.json({
      success: true,
      messages: [userMessage, assistantMessage].filter(Boolean),
    }, {
      headers: {
        'X-RateLimit-Limit': RateLimits.chat.maxRequests.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/chat:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

