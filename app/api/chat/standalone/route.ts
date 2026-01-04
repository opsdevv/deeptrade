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
    let symbolToUse: string | null = detectedSymbol || symbol;
    
    // Check if user mentions "price" or asks for an "update" - detect symbol if needed
    const messageLower = (message || '').toLowerCase();
    const mentionsPrice = messageLower.includes('price') || 
                         messageLower.includes('current price') || 
                         messageLower.includes('latest price') ||
                         messageLower.includes('what is the price') ||
                         messageLower.includes('price of');
    const asksForUpdate = messageLower.includes('update') || 
                          messageLower.includes('refresh') ||
                          messageLower.includes('latest') ||
                          messageLower.includes('current');
    
    // If user asks for price/update but no symbol, try to detect from message
    if (!symbolToUse && (mentionsPrice || asksForUpdate)) {
      try {
        const instruments = await getAvailableInstruments();
        const detected = detectSymbolFromText(message || '', instruments);
        if (detected) {
          symbolToUse = detected.symbol;
          detectedSymbolInfo = detected;
          console.log(`[INFO] Detected symbol from message for price/update query: ${symbolToUse}`);
        }
      } catch (detectionError: any) {
        console.warn(`[WARN] Could not detect symbol from message:`, detectionError.message);
      }
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

    // ALWAYS fetch latest data from Deriv API before responding when a symbol is available
    // This ensures the assistant has access to live price data for any query about any symbol
    let currentPriceData = null;
    let latestMarketData = null;
    
    // Always fetch live data if we have a symbol (either provided or detected)
    if (symbolToUse) {
      try {
        console.log(`[INFO] Fetching live data from Deriv API for ${symbolToUse}...`);
        
        // Fetch current price in parallel with market data for better performance
        const [priceResult, data2h, data15m, data5m] = await Promise.all([
          getCurrentPrice(symbolToUse).catch((err) => {
            console.warn(`[WARN] Could not fetch current price: ${err.message}`);
            return null;
          }),
          fetchMarketData(symbolToUse, '2h', 10).catch(() => null),
          fetchMarketData(symbolToUse, '15m', 10).catch(() => null),
          fetchMarketData(symbolToUse, '5m', 10).catch(() => null),
        ]);
        
        currentPriceData = priceResult;
        if (currentPriceData) {
          console.log(`[INFO] Fetched current price for ${symbolToUse}: ${currentPriceData.price}`);
        }
        
        if (data2h || data15m || data5m) {
          latestMarketData = {
            '2h': data2h || [],
            '15m': data15m || [],
            '5m': data5m || [],
          };
          console.log(`[INFO] Fetched latest market data for ${symbolToUse} (2H: ${data2h?.length || 0}, 15M: ${data15m?.length || 0}, 5M: ${data5m?.length || 0} candles)`);
        }
      } catch (error: any) {
        console.error(`[ERROR] Error fetching live data for ${symbolToUse}:`, error.message);
        // Continue without latest data - not critical, but log the error
      }
    } else if (mentionsPrice || asksForUpdate) {
      // User asked for price/update but no symbol - try to detect from message
      try {
        const instruments = await getAvailableInstruments();
        const detected = detectSymbolFromText(message || '', instruments);
        if (detected) {
          // Update symbolToUse so it's used consistently throughout the rest of the code
          symbolToUse = detected.symbol;
          detectedSymbolInfo = detected;
          console.log(`[INFO] Detected symbol from message for price/update query: ${symbolToUse}`);
          
          // Now fetch the data with the detected symbol
          try {
            console.log(`[INFO] Fetching live data from Deriv API for detected symbol ${symbolToUse}...`);
            const [priceResult, data2h, data15m, data5m] = await Promise.all([
              getCurrentPrice(symbolToUse).catch(() => null),
              fetchMarketData(symbolToUse, '2h', 10).catch(() => null),
              fetchMarketData(symbolToUse, '15m', 10).catch(() => null),
              fetchMarketData(symbolToUse, '5m', 10).catch(() => null),
            ]);
            
            currentPriceData = priceResult;
            if (currentPriceData) {
              console.log(`[INFO] Fetched current price for ${symbolToUse}: ${currentPriceData.price}`);
            }
            
            if (data2h || data15m || data5m) {
              latestMarketData = {
                '2h': data2h || [],
                '15m': data15m || [],
                '5m': data5m || [],
              };
              console.log(`[INFO] Fetched latest market data for ${symbolToUse}`);
            }
          } catch (fetchError: any) {
            console.warn(`[WARN] Could not fetch data for detected symbol: ${fetchError.message}`);
          }
        } else {
          console.warn(`[WARN] User asked for price/update but no symbol could be determined from message or selection`);
        }
      } catch (detectionError: any) {
        console.warn(`[WARN] Error detecting symbol: ${detectionError.message}`);
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
        ? `Current Price: ${currentPriceData.price} (Bid: ${currentPriceData.bid}, Ask: ${currentPriceData.ask}, Spread: ${(currentPriceData.ask - currentPriceData.bid).toFixed(5)})`
        : `Current Price: ${currentPriceData.price}`;
      const priceTime = new Date(currentPriceData.timestamp * 1000).toISOString();
      
      systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE PRICE DATA (fetched just now from Deriv API):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Symbol: ${currentPriceData.symbol}
- ${priceInfo}
- Timestamp: ${priceTime}
- Data Source: Deriv API (real-time WebSocket)

CRITICAL: You MUST use this EXACT current price when discussing the symbol. This is LIVE, REAL-TIME data fetched directly from Deriv API. Never use placeholder values, examples, or approximate prices.`;
    } else if (symbolToUse && (mentionsPrice || asksForUpdate)) {
      systemPrompt += `\n\n⚠️ IMPORTANT: The user asked about price/update for ${symbolToUse}, but current price data could not be fetched at this moment. Inform the user that live price data is temporarily unavailable and suggest they try again in a moment.`;
    } else if (symbolToUse) {
      systemPrompt += `\n\n⚠️ IMPORTANT: A symbol (${symbolToUse}) was mentioned, but current price data could not be fetched at this moment. You can still provide analysis, but inform the user that live price data is temporarily unavailable.`;
    } else if (mentionsPrice || asksForUpdate) {
      systemPrompt += `\n\n⚠️ IMPORTANT: The user asked about price or requested an update, but no symbol could be identified from their message or selection. Ask the user to specify which symbol they want price information for.`;
    }

    // Add latest market data context if available
    if (latestMarketData) {
      const latest2h = latestMarketData['2h']?.[latestMarketData['2h'].length - 1];
      const latest15m = latestMarketData['15m']?.[latestMarketData['15m'].length - 1];
      const latest5m = latestMarketData['5m']?.[latestMarketData['5m'].length - 1];
      
      // Calculate recent price ranges and trends
      const getRange = (candles: any[]) => {
        if (!candles || candles.length === 0) return null;
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        return {
          high: Math.max(...highs),
          low: Math.min(...lows),
          range: Math.max(...highs) - Math.min(...lows),
        };
      };
      
      const range2h = latestMarketData['2h'] ? getRange(latestMarketData['2h']) : null;
      const range15m = latestMarketData['15m'] ? getRange(latestMarketData['15m']) : null;
      const range5m = latestMarketData['5m'] ? getRange(latestMarketData['5m']) : null;
      
      systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LATEST MARKET DATA (fetched just now from Deriv API):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Latest Candles (10 candles per timeframe):`;
      
      if (latest2h) {
        const candleType = latest2h.close > latest2h.open ? '🟢 BULLISH' : latest2h.close < latest2h.open ? '🔴 BEARISH' : '⚪ NEUTRAL';
        const body = Math.abs(latest2h.close - latest2h.open);
        const wick = latest2h.high - latest2h.low - body;
        systemPrompt += `\n\n📊 2H TIMEFRAME (Latest candle):
  ${candleType} | O: ${latest2h.open.toFixed(5)} | H: ${latest2h.high.toFixed(5)} | L: ${latest2h.low.toFixed(5)} | C: ${latest2h.close.toFixed(5)}
  Body Size: ${body.toFixed(5)} | Wick Size: ${wick.toFixed(5)}`;
        if (range2h) {
          systemPrompt += `\n  10-Candle Range: ${range2h.low.toFixed(5)} - ${range2h.high.toFixed(5)} (${range2h.range.toFixed(5)})`;
        }
      }
      
      if (latest15m) {
        const candleType = latest15m.close > latest15m.open ? '🟢 BULLISH' : latest15m.close < latest15m.open ? '🔴 BEARISH' : '⚪ NEUTRAL';
        const body = Math.abs(latest15m.close - latest15m.open);
        const wick = latest15m.high - latest15m.low - body;
        systemPrompt += `\n\n📊 15M TIMEFRAME (Latest candle):
  ${candleType} | O: ${latest15m.open.toFixed(5)} | H: ${latest15m.high.toFixed(5)} | L: ${latest15m.low.toFixed(5)} | C: ${latest15m.close.toFixed(5)}
  Body Size: ${body.toFixed(5)} | Wick Size: ${wick.toFixed(5)}`;
        if (range15m) {
          systemPrompt += `\n  10-Candle Range: ${range15m.low.toFixed(5)} - ${range15m.high.toFixed(5)} (${range15m.range.toFixed(5)})`;
        }
      }
      
      if (latest5m) {
        const candleType = latest5m.close > latest5m.open ? '🟢 BULLISH' : latest5m.close < latest5m.open ? '🔴 BEARISH' : '⚪ NEUTRAL';
        const body = Math.abs(latest5m.close - latest5m.open);
        const wick = latest5m.high - latest5m.low - body;
        systemPrompt += `\n\n📊 5M TIMEFRAME (Latest candle):
  ${candleType} | O: ${latest5m.open.toFixed(5)} | H: ${latest5m.high.toFixed(5)} | L: ${latest5m.low.toFixed(5)} | C: ${latest5m.close.toFixed(5)}
  Body Size: ${body.toFixed(5)} | Wick Size: ${wick.toFixed(5)}`;
        if (range5m) {
          systemPrompt += `\n  10-Candle Range: ${range5m.low.toFixed(5)} - ${range5m.high.toFixed(5)} (${range5m.range.toFixed(5)})`;
        }
      }
      
      systemPrompt += `\n\n💡 Use this LIVE market data to provide up-to-date analysis and insights. Reference actual prices from these candles when discussing price action, support/resistance, or market structure.`;
    }

    systemPrompt += `\n\nIMPORTANT: The system AUTOMATICALLY fetches LIVE data from the Deriv API before EACH response when a symbol is available. This means you ALWAYS have access to real-time market data.

LIVE DATA CAPABILITIES (automatically fetched):
- Current prices and real-time quotes (BID/ASK spreads when available)
- Historical candle data for multiple timeframes (2H, 15m, 5m) - latest 10 candles per timeframe
- Real-time market conditions and price action
- Market structure and recent price movements

When live data is provided above:
- ALWAYS reference the actual current price when discussing the symbol
- Use the latest candle data to provide context about recent price action
- Mention that the data is LIVE and fetched in real-time from Deriv API
- Compare current price to recent highs/lows from the candle data when relevant

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
