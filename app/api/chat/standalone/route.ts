import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { callDeepSeekAPI } from '@/lib/api/deepseek';
import { getAvailableInstruments, getCurrentPrice, fetchMarketData } from '@/lib/api/deriv';
import { analyze } from '@/lib/analysis/engine';
import { detectSymbolFromText } from '@/lib/utils/symbol-detector';

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

    // Detect symbol from message if not explicitly provided
    let detectedSymbol = symbol;
    let detectedSymbolInfo = null;
    if ((message || screenshot_url) && !symbol) {
      try {
        const instruments = await getAvailableInstruments();
        const detected = detectSymbolFromText(message || '', instruments);
        if (detected) {
          detectedSymbol = detected.symbol;
          detectedSymbolInfo = detected;
        }
      } catch (error) {
        console.error('Error detecting symbol from text:', error);
        // Continue without symbol detection
      }
    }
    
    // Use detected symbol if available, otherwise use provided symbol
    const symbolToUse = detectedSymbol || symbol;

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
    const insertPayload = {
      session_id,
      symbol: symbolToUse || null,
      role: 'user',
      content: message || (screenshot_url ? 'Please analyze this screenshot.' : ''),
      screenshot_url: screenshot_url || null,
    };
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:142',message:'Before database insert',data:{insertPayload,sessionIdType:typeof session_id,sessionIdValue:session_id,sessionIdLength:session_id?.length,hasContent:!!insertPayload.content,contentLength:insertPayload.content?.length,symbolToUse},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2,H3,H4,H5'})}).catch(()=>{});
    // #endregion
    const { data: userMessage, error: userError } = await supabase
      .from('chat_messages')
      .insert(insertPayload)
      .select()
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:156',message:'After database insert',data:{hasUserMessage:!!userMessage,hasError:!!userError,errorCode:userError?.code,errorMessage:userError?.message,errorDetails:userError?.details,errorHint:userError?.hint,fullError:JSON.stringify(userError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2,H3,H4,H5'})}).catch(()=>{});
    // #endregion

    if (userError) {
      console.error('Error saving user message:', userError);
      // Provide more specific error message for schema issues
      let errorMessage = 'Failed to save message';
      if (userError.code === 'PGRST204' && userError.message?.includes('session_id')) {
        errorMessage = 'Database schema error: session_id column missing. Please run migration 003_standalone_chat.sql';
      } else if (userError.message) {
        errorMessage = `Failed to save message: ${userError.message}`;
      }
      const errorResponse = { error: errorMessage, success: false };
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:163',message:'Returning error response',data:{response:errorResponse,statusCode:500,originalError:userError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H3,H4'})}).catch(()=>{});
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

    // ALWAYS fetch latest data from Deriv API before responding
    // This ensures the assistant has access to live price data for any query
    let currentPriceData = null;
    let latestMarketData = null;
    
    if (symbolToUse) {
      try {
        // Fetch current price
        currentPriceData = await getCurrentPrice(symbolToUse);
        if (currentPriceData) {
          console.log(`[INFO] Fetched current price for ${symbolToUse}: ${currentPriceData.price}`);
        } else {
          console.warn(`[WARN] Could not fetch current price for ${symbolToUse}`);
        }
        
        // Fetch latest market data for context (just a few recent candles)
        try {
          const [data2h, data15m, data5m] = await Promise.all([
            fetchMarketData(symbolToUse, '2h', 10).catch(() => null),
            fetchMarketData(symbolToUse, '15m', 10).catch(() => null),
            fetchMarketData(symbolToUse, '5m', 10).catch(() => null),
          ]);
          
          if (data2h || data15m || data5m) {
            latestMarketData = {
              '2h': data2h || [],
              '15m': data15m || [],
              '5m': data5m || [],
            };
            console.log(`[INFO] Fetched latest market data for ${symbolToUse}`);
          }
        } catch (marketDataError: any) {
          console.warn(`[WARN] Could not fetch latest market data: ${marketDataError.message}`);
          // Continue without market data - not critical
        }
      } catch (priceError: any) {
        console.error(`[ERROR] Error fetching latest data for ${symbolToUse}:`, priceError.message);
        // Continue without latest data - not critical, but log the error
      }
    } else {
      // Try to detect symbol from message if not provided
      try {
        const instruments = await getAvailableInstruments();
        const detected = detectSymbolFromText(message || '', instruments);
        if (detected) {
          const detectedSymbol = detected.symbol;
          console.log(`[INFO] Detected symbol from message: ${detectedSymbol}`);
          
          // Fetch data for detected symbol
          try {
            currentPriceData = await getCurrentPrice(detectedSymbol);
            if (currentPriceData) {
              console.log(`[INFO] Fetched current price for detected symbol ${detectedSymbol}: ${currentPriceData.price}`);
            }
          } catch (priceError: any) {
            console.warn(`[WARN] Could not fetch price for detected symbol ${detectedSymbol}:`, priceError.message);
          }
        }
      } catch (detectionError: any) {
        console.warn(`[WARN] Could not detect symbol from message:`, detectionError.message);
        // Continue without symbol detection
      }
    }

    // Run analysis if requested and symbol is provided (use detected symbol if available)
    let analysisResult = null;
    if (run_analysis && symbolToUse) {
      try {
        // Fetch market data for all timeframes
        const [data2h, data15m, data5m] = await Promise.all([
          fetchMarketData(symbolToUse, '2h', 200),
          fetchMarketData(symbolToUse, '15m', 200),
          fetchMarketData(symbolToUse, '5m', 200),
        ]);

        // Run analysis
        analysisResult = analyze(symbolToUse, {
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

You can analyze any trading symbol available on Deriv. When a user asks about a symbol, you can provide insights based on ICT/SMC principles.

ABSOLUTE REQUIREMENT - PRICES: You MUST ALWAYS provide ACTUAL LIVE PRICES from real market data. NEVER show template structures, example prices, placeholder values, or format examples. When discussing any prices (current price, entry, stop, target, support, resistance, etc.), you MUST use actual prices from the live market data provided below.`;

    // Add current price data if available
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
    } else if (symbolToUse) {
      systemPrompt += `\n\nIMPORTANT: A symbol (${symbolToUse}) was mentioned, but current price data could not be fetched at this moment. You can still provide analysis, but inform the user that live price data is temporarily unavailable.`;
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

    systemPrompt += `\n\nIMPORTANT: The system automatically fetches the latest data from the Deriv API before each response. Always use the most recent data provided above when answering questions about current prices, market conditions, or recent price action.

The system can fetch live market data for any symbol available on Deriv, including:
- Current prices and real-time quotes (automatically provided above when available)
- Historical candle data for multiple timeframes (2H, 15m, 5m)
- Market conditions and price action
- Available trading instruments and their details

CRITICAL: Keep your responses SHORT and STRAIGHT TO THE POINT. Especially for chart analysis, screenshot analysis, or visual data - be concise and brief. Avoid lengthy explanations or text-heavy responses. Focus on key insights only.`;

    // Add symbol information with confirmation
    if (symbolToUse) {
      // Try to get display name for the symbol
      let displayNameForSymbol = symbolToUse;
      if (!detectedSymbolInfo) {
        try {
          const instruments = await getAvailableInstruments();
          const foundInst = instruments.find(inst => inst.symbol === symbolToUse);
          if (foundInst) {
            displayNameForSymbol = foundInst.display_name;
          }
        } catch (error) {
          // Ignore error, use symbol as-is
        }
      } else {
        displayNameForSymbol = detectedSymbolInfo.displayName;
      }
      
      if (detectedSymbolInfo && !symbol) {
        // Symbol was detected from text (not from dropdown) - always confirm
        systemPrompt += `\n\nIMPORTANT: The user mentioned "${detectedSymbolInfo.displayName}" (symbol: ${detectedSymbolInfo.symbol}) in their message. 
Please confirm you are analyzing the correct symbol at the beginning of your response: "${displayNameForSymbol} (${symbolToUse})".
This ensures we're both on the same page about which instrument to analyze.`;
      } else if (symbol && detectedSymbolInfo && detectedSymbolInfo.symbol !== symbol) {
        // User provided symbol via dropdown but message mentions different symbol - clarify
        systemPrompt += `\n\nIMPORTANT: The user selected symbol "${symbol}" but their message mentions "${detectedSymbolInfo.displayName}". 
Please clarify which symbol they want to analyze, or confirm you're using the selected symbol: ${symbol}.`;
      } else {
        // Symbol provided via dropdown or exact match - still confirm for clarity
        systemPrompt += `\n\nCurrent Symbol: ${displayNameForSymbol} (${symbolToUse})
Please acknowledge this symbol at the beginning of your response to confirm you're analyzing the correct instrument.`;
      }
    } else if (message && (message.toLowerCase().includes('analyze') || message.toLowerCase().includes('analysis'))) {
      // User asked for analysis but no symbol detected - ask for clarification
      systemPrompt += `\n\nIMPORTANT: The user requested analysis but no symbol was clearly identified. 
Please ask the user to specify which symbol/instrument they want to analyze. 
You can suggest common symbols like Volatility 75 Index (R_75), Volatility 50 Index (R_50), Gold/USD (XAUUSD), etc.`;
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
        symbol: symbolToUse || null,
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
