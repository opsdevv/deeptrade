// Deriv API Client - WebSocket Implementation

import { TimeframeData, Timeframe } from '@/types/analysis';
import WebSocket from 'ws';

const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3';
const DERIV_APP_ID = process.env.DERIV_APP_ID || '1089'; // Default test app ID
const DERIV_API_KEY = process.env.DERIV_API_KEY || '25hYKarkuJw1gis';

// WebSocket connection pool for reuse
let wsConnection: WebSocket | null = null;
let wsReady = false;
let wsAuthToken: string | null = null;
let isConnecting = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
let requestId = 1;

/**
 * Convert timeframe to Deriv format (in seconds)
 */
function timeframeToDeriv(timeframe: Timeframe): number {
  const mapping: Record<Timeframe, number> = {
    '2h': 7200, // 2 hours in seconds
    '15m': 900,  // 15 minutes in seconds
    '5m': 300,   // 5 minutes in seconds
  };
  return mapping[timeframe] || 300;
}

/**
 * Convert symbol to Deriv format
 * Rules:
 * - Forex pairs and commodities: Add "frx" prefix (e.g., EURUSD -> frxEURUSD, XAUUSD -> frxXAUUSD)
 * - Derived/synthetic indices: Keep as-is (e.g., R_50, CRASH_300)
 * - Stock indices: Keep as-is (e.g., US_100, FTSE_100)
 * - Cryptocurrencies: Keep as-is (e.g., BTCUSD)
 */
function normalizeSymbol(symbol: string): string {
  const upperSymbol = symbol.toUpperCase().trim();
  
  // Map common variations to Deriv symbols (exact matches first)
  const symbolMap: Record<string, string> = {
    'VOLATILITY50': 'R_50',
    'VOLATILITY 50': 'R_50',
    'V50': 'R_50',
    'VOLATILITY75': 'R_75',
    'VOLATILITY 75': 'R_75',
    'V75': 'R_75',
    'VOLATILITY100': 'R_100',
    'VOLATILITY 100': 'R_100',
    'V100': 'R_100',
    'GOLD': 'frxXAUUSD',
    'SILVER': 'frxXAGUSD',
  };

  // Check exact match first
  if (symbolMap[upperSymbol]) {
    return symbolMap[upperSymbol];
  }

  // If already has frx prefix, return as-is
  if (upperSymbol.startsWith('FRX')) {
    return upperSymbol;
  }

  // Check if it's a derived/synthetic index (starts with R_, CRASH, BOOM, JD, RB, STEP, DEX, etc.)
  const derivedPatterns = [
    /^R_\d+$/,           // R_10, R_50, etc.
    /^1HZ\d+V$/,         // 1HZ10V, 1HZ50V, etc.
    /^CRASH\d+N?$/,      // CRASH300N, CRASH500, etc. (no underscore, optional N suffix)
    /^BOOM\d+$/,         // BOOM300, BOOM500, etc. (no underscore)
    /^JD\d+$/,           // JD10, JD25, JD50, etc.
    /^RB\d+$/,           // RB100, RB200, etc.
    /^STPRNG\d*$/,       // STPRNG, STPRNG2, STPRNG3, STPRNG4, STPRNG5
    /^STEPINDEX$/,       // STEPINDEX (legacy)
    /^DEX\d+(UP|DOWN)$/, // DEX900UP, DEX900DOWN, etc.
    // Legacy patterns for backward compatibility
    /^CRASH_\d+$/,       // CRASH_300 (old format)
    /^BOOM_\d+$/,        // BOOM_300 (old format)
    /^JUMP_\d+$/,        // JUMP_10 (old format)
    /^STEP_\d+$/,        // STEP_100 (old format)
    /^RANGE_BREAK_\d+$/, // RANGE_BREAK_100 (old format)
    /^DEX_\d+_(UP|DOWN)$/, // DEX_900_UP (old format)
  ];
  
  if (derivedPatterns.some(pattern => pattern.test(upperSymbol))) {
    return upperSymbol; // Keep derived indices as-is
  }

  // Check if it's a stock index (contains underscore and numbers, like US_100, FTSE_100, NAS_100)
  // Stock indices can have various formats: US_100, NAS_100, FTSE_100, OTC_NDX, OTC_SPX, OTC_DJI, etc.
  const stockIndexPattern = /^[A-Z]+\d+$/; // US100, FTSE100, etc. (without underscore)
  const stockIndexPattern2 = /^[A-Z]+_\d+$/; // US_100, FTSE_100, NAS_100, etc. (with underscore)
  const stockIndexPattern3 = /^[A-Z]+_OTC$/; // US_OTC, etc.
  const stockIndexPattern4 = /^OTC_[A-Z]+$/; // OTC_NDX, OTC_SPX, OTC_DJI, etc.
  const stockIndexPattern5 = /^(US|NAS|FTSE|DAX|AUS|ESP|FRA|GER|HKG|JPN|NLD|SWE|SWI|UK)_/; // Common stock index prefixes
  
  if (stockIndexPattern.test(upperSymbol) || 
      stockIndexPattern2.test(upperSymbol) || 
      stockIndexPattern3.test(upperSymbol) ||
      stockIndexPattern4.test(upperSymbol) ||
      stockIndexPattern5.test(upperSymbol)) {
    // Stock indices should be kept as-is (Deriv uses formats like US_100, NAS_100, OTC_NDX, etc.)
    return upperSymbol;
  }

  // Check if it's a commodity (XAU, XAG, XPD, XPT, WTICO, BRENT, NGAS)
  // Commodities can be: XAUUSD, XAGUSD, XPDUSD, XPTUSD, WTICOUSD, BRENTUSD, NGASUSD
  const commodityPattern = /^(XAU|XAG|XPD|XPT|WTICO|BRENT|NGAS)/;
  if (commodityPattern.test(upperSymbol)) {
    // If it already ends with USD or another currency, keep it, just add frx prefix
    // If it's just the commodity code, we'll add USD suffix (but usually it comes with USD)
    return `frx${upperSymbol}`;
  }

  // Check if it's a forex pair (6 letters, typically like EURUSD, GBPJPY)
  // Forex pairs are usually 6 characters (3+3 currency codes)
  // But can also be 7 if one currency is 4 letters (like USDCNH)
  const forexPattern = /^[A-Z]{3,4}[A-Z]{3}$/;
  if (forexPattern.test(upperSymbol)) {
    // Additional validation: should contain common currency codes
    const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNH', 'HKD', 'SGD', 'TRY', 'MXN', 'ZAR', 'INR', 'BRL', 'RUB', 'KRW', 'THB'];
    const hasCurrency = commonCurrencies.some(cc => upperSymbol.includes(cc));
    
    if (hasCurrency) {
      return `frx${upperSymbol}`;
    }
  }

  // Check if it's a cryptocurrency (CRY prefix or BTC, ETH, LTC, XRP, USDC, etc.)
  const cryptoPattern = /^CRY(BTC|ETH|LTC|XRP|USDC|EUSDT|TUSDT)/;
  if (cryptoPattern.test(upperSymbol)) {
    // Cryptocurrencies with CRY prefix should be kept as-is
    return upperSymbol;
  }
  
  // Legacy cryptocurrency patterns (without CRY prefix)
  const legacyCryptoPattern = /^(BTC|ETH|LTC|XRP|USDC|EUSDT|TUSDT)/;
  if (legacyCryptoPattern.test(upperSymbol)) {
    // Legacy cryptocurrencies might not need frx prefix, keep as-is for now
    // If they fail, the findCorrectSymbol function will handle it
    return upperSymbol;
  }

  // Default: return as-is (will be handled by findCorrectSymbol if it fails)
  return upperSymbol;
}

/**
 * Try to find the correct symbol format by querying active symbols
 * Tries multiple variations: original, with frx prefix, without frx prefix, etc.
 */
async function findCorrectSymbol(searchSymbol: string): Promise<string | null> {
  try {
    const response = await sendRequest({
      active_symbols: 1,
      product_type: 'basic',
    }, 5000);
    
    if (response.active_symbols && Array.isArray(response.active_symbols)) {
      const searchUpper = searchSymbol.toUpperCase().trim();
      
      // Generate search variations
      const variations: string[] = [searchUpper];
      
      // If it doesn't have frx prefix, try with it
      if (!searchUpper.startsWith('FRX')) {
        variations.push(`FRX${searchUpper}`);
      } else {
        // If it has frx prefix, try without it
        variations.push(searchUpper.substring(3));
      }
      
      // Try each variation
      for (const variation of variations) {
        // Try exact match first
        const exactMatch = response.active_symbols.find((sym: any) => {
          const symStr = (sym.symbol || '').toUpperCase();
          const displayStr = (sym.symbol_display || '').toUpperCase();
          return symStr === variation || displayStr === variation;
        });
        if (exactMatch) {
          return exactMatch.symbol || exactMatch.symbol_display;
        }
        
        // Try case-insensitive partial match
        const partialMatch = response.active_symbols.find((sym: any) => {
          const symStr = (sym.symbol || '').toUpperCase();
          const displayStr = (sym.symbol_display || '').toUpperCase();
          return symStr.includes(variation) || 
                 variation.includes(symStr) ||
                 displayStr.includes(variation) ||
                 variation.includes(displayStr);
        });
        if (partialMatch) {
          return partialMatch.symbol || partialMatch.symbol_display;
        }
      }
      
      // Last resort: try to find by removing common suffixes/prefixes
      const cleaned = searchUpper.replace(/^(FRX|OTC_|OTC)/, '').replace(/_/g, '');
      if (cleaned !== searchUpper) {
        const cleanedMatch = response.active_symbols.find((sym: any) => {
          const symStr = (sym.symbol || '').toUpperCase().replace(/^(FRX|OTC_|OTC)/, '').replace(/_/g, '');
          return symStr === cleaned;
        });
        if (cleanedMatch) {
          return cleanedMatch.symbol || cleanedMatch.symbol_display;
        }
      }
    }
  } catch (error) {
    // Silently fail - we'll use the normalized symbol
    console.warn(`[WARN] findCorrectSymbol failed for ${searchSymbol}:`, error);
  }
  return null;
}

/**
 * Initialize WebSocket connection with retry logic
 */
async function initializeConnection(): Promise<WebSocket> {
  // Check if connection is already open and ready
  if (wsConnection && wsReady && wsConnection.readyState === WebSocket.OPEN) {
    return wsConnection;
  }

  // If already connecting, wait for it
  if (isConnecting) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (wsConnection && wsReady && wsConnection.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval);
          resolve(wsConnection);
        } else if (!isConnecting) {
          clearInterval(checkInterval);
          reject(new Error('Connection attempt failed'));
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Connection wait timeout'));
      }, 15000);
    });
  }

  // Close existing connection if it exists but is not ready
  if (wsConnection) {
    try {
      wsConnection.removeAllListeners();
      if (wsConnection.readyState === WebSocket.OPEN || wsConnection.readyState === WebSocket.CONNECTING) {
        wsConnection.close();
      }
    } catch (e) {
      // Ignore errors when closing
    }
    wsConnection = null;
    wsReady = false;
  }

  isConnecting = true;
  connectionRetries++;

  return new Promise((resolve, reject) => {
    console.log(`[INFO] Connecting to Deriv WebSocket (attempt ${connectionRetries}): ${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
    const ws = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);

    const connectionTimeout = setTimeout(() => {
      if (!wsReady) {
        isConnecting = false;
        try {
          ws.close();
        } catch (e) {
          // Ignore
        }
        wsConnection = null;
        wsReady = false;
        
        if (connectionRetries < MAX_RETRIES) {
          console.log(`[INFO] Connection timeout, retrying (${connectionRetries}/${MAX_RETRIES})...`);
          setTimeout(() => {
            initializeConnection().then(resolve).catch(reject);
          }, 1000 * connectionRetries);
        } else {
          connectionRetries = 0;
          reject(new Error('WebSocket connection timeout after multiple retries'));
        }
      }
    }, 15000); // Increased timeout to 15 seconds

    ws.on('open', () => {
      console.log('[INFO] Deriv WebSocket connected');
      clearTimeout(connectionTimeout);
      wsConnection = ws;
      connectionRetries = 0; // Reset retry counter on success

      // Authorize if we have an API key
      if (DERIV_API_KEY) {
        authorizeConnection(ws, DERIV_API_KEY)
          .then(() => {
            wsReady = true;
            isConnecting = false;
            console.log('[INFO] WebSocket connection ready and authorized');
            resolve(ws);
          })
          .catch((authError) => {
            console.error('[ERROR] Authorization failed:', authError);
            isConnecting = false;
            wsConnection = null;
            wsReady = false;
            
            if (connectionRetries < MAX_RETRIES) {
              console.log(`[INFO] Authorization failed, retrying connection (${connectionRetries}/${MAX_RETRIES})...`);
              setTimeout(() => {
                initializeConnection().then(resolve).catch(reject);
              }, 1000 * connectionRetries);
            } else {
              connectionRetries = 0;
              reject(authError);
            }
          });
      } else {
        // No auth needed for public endpoints
        wsReady = true;
        isConnecting = false;
        console.log('[INFO] WebSocket connection ready (no auth)');
        resolve(ws);
      }
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(message);
      } catch (error) {
        console.error('[ERROR] Failed to parse WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('[ERROR] Deriv WebSocket error:', error);
      clearTimeout(connectionTimeout);
      isConnecting = false;
      
      if (connectionRetries < MAX_RETRIES) {
        console.log(`[INFO] WebSocket error, retrying (${connectionRetries}/${MAX_RETRIES})...`);
        wsConnection = null;
        wsReady = false;
        setTimeout(() => {
          initializeConnection().then(resolve).catch(reject);
        }, 1000 * connectionRetries);
      } else {
        connectionRetries = 0;
        wsConnection = null;
        wsReady = false;
        reject(error);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[INFO] Deriv WebSocket closed: code=${code}, reason=${reason.toString()}`);
      clearTimeout(connectionTimeout);
      isConnecting = false;
      wsConnection = null;
      wsReady = false;
      
      // If connection was closed unexpectedly, mark for reconnection
      if (code !== 1000 && pendingRequests.size > 0) {
        console.log('[WARN] Connection closed unexpectedly, pending requests will fail');
        // Reject all pending requests
        pendingRequests.forEach(({ reject: rejectRequest }) => {
          rejectRequest(new Error('WebSocket connection closed unexpectedly'));
        });
        pendingRequests.clear();
      }
    });
  });
}

/**
 * Authorize WebSocket connection with API token
 */
async function authorizeConnection(ws: WebSocket, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const authId = requestId++;
    const authRequest = {
      authorize: token,
      req_id: authId,
    };

    const timeout = setTimeout(() => {
      pendingRequests.delete(authId);
      reject(new Error('Authorization timeout'));
    }, 10000);

    pendingRequests.set(authId, {
      resolve: (response: any) => {
        clearTimeout(timeout);
        if (response.error) {
          reject(new Error(response.error.message || 'Authorization failed'));
        } else {
          wsAuthToken = token;
          console.log('[INFO] Deriv API authorized successfully');
          resolve();
        }
      },
      reject: (error: any) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    ws.send(JSON.stringify(authRequest));
  });
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(message: any) {
  const reqId = message.req_id;
  if (reqId && pendingRequests.has(reqId)) {
    const { resolve } = pendingRequests.get(reqId)!;
    pendingRequests.delete(reqId);
    resolve(message);
  }
}

/**
 * Send WebSocket request and wait for response with retry logic
 */
async function sendRequest(request: any, timeoutMs: number = 10000, retries: number = 2): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Reset connection if it's not ready
      if (!wsConnection || !wsReady || wsConnection.readyState !== WebSocket.OPEN) {
        wsConnection = null;
        wsReady = false;
        isConnecting = false;
      }
      
      const ws = await initializeConnection();
      const reqId = requestId++;
      const fullRequest = { ...request, req_id: reqId };

      try {
        const result = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingRequests.delete(reqId);
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
          }, timeoutMs);

          pendingRequests.set(reqId, {
            resolve: (response: any) => {
              clearTimeout(timeout);
              if (response.error) {
                reject(new Error(response.error.message || 'API request failed'));
              } else {
                resolve(response);
              }
            },
            reject: (error: any) => {
              clearTimeout(timeout);
              reject(error);
            },
          });

          try {
            if (ws.readyState !== WebSocket.OPEN) {
              throw new Error('WebSocket is not open');
            }
            ws.send(JSON.stringify(fullRequest));
          } catch (sendError: any) {
            clearTimeout(timeout);
            pendingRequests.delete(reqId);
            reject(new Error(`Failed to send request: ${sendError.message}`));
          }
        });
        
        // Success - return result
        return result;
      } catch (requestError: any) {
        lastError = requestError;
        // Check if we should retry
        const shouldRetry = attempt < retries && (
          requestError.message?.includes('timeout') ||
          requestError.message?.includes('connection') ||
          requestError.message?.includes('not open')
        );
        
        if (shouldRetry) {
          console.log(`[WARN] Request failed, retrying (attempt ${attempt + 1}/${retries + 1}):`, requestError.message);
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        } else {
          throw requestError;
        }
      }
    } catch (error: any) {
      lastError = new Error(`WebSocket connection failed: ${error.message}`);
      if (attempt < retries) {
        console.log(`[WARN] Connection failed, retrying (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      } else {
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error('Request failed after all retries');
}

/**
 * Fetch market data from Deriv API using WebSocket
 */
export async function fetchMarketData(
  symbol: string,
  timeframe: Timeframe,
  count: number = 200
): Promise<TimeframeData[]> {
  if (!DERIV_API_KEY) {
    throw new Error('DERIV_API_KEY not configured. Please set DERIV_API_KEY in your environment variables.');
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const granularity = timeframeToDeriv(timeframe);
  
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:234',message:'fetchMarketData entry',data:{originalSymbol:symbol,normalizedSymbol,timeframe,granularity,count},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  try {
    // Use ticks_history endpoint (standard for historical candle data)
    let requestPayload = {
      ticks_history: normalizedSymbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      start: 1,
      style: 'candles',
      granularity,
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:250',message:'Before ticks_history request',data:{symbol:normalizedSymbol,originalSymbol:symbol,timeframe,granularity,count},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    let response = await sendRequest(requestPayload);
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:258',message:'After ticks_history request',data:{symbol:normalizedSymbol,timeframe,hasCandles:!!response.candles,candlesLength:response.candles?.length||0,hasHistory:!!response.history,responseKeys:Object.keys(response),error:response.error,errorCode:response.error?.code,errorMessage:response.error?.message,fullError:JSON.stringify(response.error),responsePreview:JSON.stringify(response).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    // Check for API error response
    if (response.error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:264',message:'ticks_history failed, trying to find correct symbol',data:{symbol:normalizedSymbol,originalSymbol:symbol,timeframe,errorCode:response.error.code,errorMessage:response.error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      
      // Try to find the correct symbol format - try both original and normalized
      let correctSymbol = await findCorrectSymbol(symbol);
      
      // If not found with original, try with normalized symbol
      if (!correctSymbol) {
        correctSymbol = await findCorrectSymbol(normalizedSymbol);
      }
      
      // Also try common variations manually
      if (!correctSymbol) {
        const variations = [
          normalizedSymbol.startsWith('FRX') ? normalizedSymbol.substring(3) : `FRX${normalizedSymbol}`,
          symbol.toUpperCase(),
          normalizedSymbol,
        ];
        
        for (const variation of variations) {
          if (variation && variation !== normalizedSymbol) {
            const found = await findCorrectSymbol(variation);
            if (found) {
              correctSymbol = found;
              break;
            }
          }
        }
      }
      
      if (correctSymbol && correctSymbol !== normalizedSymbol) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:270',message:'Found alternative symbol, retrying',data:{originalSymbol:symbol,normalizedSymbol,correctSymbol,timeframe},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // Retry with correct symbol
        requestPayload = {
          ticks_history: correctSymbol,
          adjust_start_time: 1,
          count,
          end: 'latest',
          start: 1,
          style: 'candles',
          granularity,
        };
        
        response = await sendRequest(requestPayload);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:285',message:'After retry with correct symbol',data:{correctSymbol,timeframe,hasCandles:!!response.candles,candlesLength:response.candles?.length||0,hasHistory:!!response.history,error:response.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        if (response.error) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:292',message:'Retry with correct symbol also failed',data:{correctSymbol,timeframe,errorCode:response.error.code,errorMessage:response.error.message,fullError:JSON.stringify(response.error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          throw new Error(`Deriv API error for ${correctSymbol}: ${response.error.message || JSON.stringify(response.error)}`);
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:298',message:'Could not find alternative symbol',data:{symbol:normalizedSymbol,originalSymbol:symbol,timeframe,errorCode:response.error.code,errorMessage:response.error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        throw new Error(`Deriv API error for ${normalizedSymbol} (original: ${symbol}): ${response.error.message || JSON.stringify(response.error)}. Symbol may not be available or may need different formatting.`);
      }
    }

    // Transform Deriv response to TimeframeData format
    if (response.candles && Array.isArray(response.candles) && response.candles.length > 0) {
      const transformed = response.candles.map((candle: any) => ({
        time: candle.epoch || candle.time || Date.now() / 1000,
        open: parseFloat(candle.open) || 0,
        high: parseFloat(candle.high) || 0,
        low: parseFloat(candle.low) || 0,
        close: parseFloat(candle.close) || 0,
        volume: candle.volume ? parseFloat(candle.volume) : undefined,
      }));

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:270',message:'Candles transformed',data:{symbol:normalizedSymbol,timeframe,transformedLength:transformed.length,firstCandle:transformed[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      
      console.log(`[INFO] Fetched ${transformed.length} candles for ${normalizedSymbol} (${timeframe})`);
      return transformed;
    }

    // Fallback: try history format
    if (response.history && response.history.prices && Array.isArray(response.history.prices) && response.history.prices.length > 0) {
      const prices = response.history.prices;
      const transformed = prices.map((price: any, index: number) => {
        const time = response.history.times?.[index] || Date.now() / 1000 - (prices.length - index) * granularity;
        return {
          time,
          open: parseFloat(price.open) || 0,
          high: parseFloat(price.high) || 0,
          low: parseFloat(price.low) || 0,
          close: parseFloat(price.close) || 0,
        };
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:288',message:'History transformed',data:{symbol:normalizedSymbol,timeframe,transformedLength:transformed.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      
      console.log(`[INFO] Fetched ${transformed.length} candles from history for ${normalizedSymbol} (${timeframe})`);
      return transformed;
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/api/deriv.ts:291',message:'Unexpected response format',data:{symbol:normalizedSymbol,timeframe,responseKeys:Object.keys(response),responsePreview:JSON.stringify(response).substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    throw new Error(`Unexpected Deriv API response format for ${normalizedSymbol}. Response: ${JSON.stringify(response).substring(0, 200)}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Error fetching Deriv data for ${normalizedSymbol} (${timeframe}):`, errorMessage);
    throw new Error(`Failed to fetch market data from Deriv API: ${errorMessage}`);
  }
}

export interface DerivInstrument {
  symbol: string;
  display_name: string;
  category: 'forex' | 'stock_indices' | 'commodities' | 'derived' | 'cryptocurrencies';
  market?: string;
  submarket?: string;
}

export interface CurrentPrice {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

/**
 * Get current/live price for a symbol from Deriv API
 */
export async function getCurrentPrice(symbol: string): Promise<CurrentPrice | null> {
  if (!DERIV_API_KEY) {
    console.warn('[WARN] DERIV_API_KEY not configured, cannot fetch current price');
    return null;
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  let symbolToUse = normalizedSymbol;

  try {
    // First, try to use ticks endpoint to get the latest tick/price
    try {
      const response = await sendRequest({
        ticks: symbolToUse,
        subscribe: 0, // Don't subscribe, just get current tick
      }, 5000);

      if (!response.error) {
        const tick = response.tick || response.ticks?.[0] || response.quotes?.[0];
        if (tick) {
          const price = parseFloat(tick.quote || tick.price || tick.close || 0);
          if (price > 0) {
            return {
              symbol: symbolToUse,
              price,
              bid: tick.bid ? parseFloat(tick.bid) : undefined,
              ask: tick.ask ? parseFloat(tick.ask) : undefined,
              timestamp: tick.epoch || tick.time || Date.now() / 1000,
            };
          }
        }
      } else {
        // If ticks fails, try to find correct symbol
        const correctSymbol = await findCorrectSymbol(symbolToUse);
        if (correctSymbol && correctSymbol !== symbolToUse) {
          symbolToUse = correctSymbol;
          const retryResponse = await sendRequest({
            ticks: symbolToUse,
            subscribe: 0,
          }, 5000);
          
          if (!retryResponse.error) {
            const tick = retryResponse.tick || retryResponse.ticks?.[0] || retryResponse.quotes?.[0];
            if (tick) {
              const price = parseFloat(tick.quote || tick.price || tick.close || 0);
              if (price > 0) {
                return {
                  symbol: symbolToUse,
                  price,
                  bid: tick.bid ? parseFloat(tick.bid) : undefined,
                  ask: tick.ask ? parseFloat(tick.ask) : undefined,
                  timestamp: tick.epoch || tick.time || Date.now() / 1000,
                };
              }
            }
          }
        }
      }
    } catch (ticksError) {
      // Ticks endpoint failed, will try candle fallback
      console.log(`[INFO] Ticks endpoint failed for ${symbolToUse}, trying candle fallback`);
    }

    // Fallback: get latest candle and use its close price
    try {
      const candleData = await fetchMarketData(symbolToUse, '5m', 1);
      if (candleData && candleData.length > 0) {
        const latestCandle = candleData[candleData.length - 1];
        if (latestCandle.close > 0) {
          return {
            symbol: symbolToUse,
            price: latestCandle.close,
            timestamp: latestCandle.time,
          };
        }
      }
    } catch (candleError: any) {
      console.error(`[ERROR] Candle fallback also failed for ${symbolToUse}:`, candleError.message);
    }

    return null;
  } catch (error: any) {
    console.error(`[ERROR] Error getting current price for ${symbolToUse}:`, error.message);
    return null;
  }
}

/**
 * Map Deriv market/submarket to category
 */
function mapToCategory(market?: string, submarket?: string): DerivInstrument['category'] {
  const marketLower = (market || '').toLowerCase();
  const submarketLower = (submarket || '').toLowerCase();
  
  if (marketLower.includes('forex') || marketLower.includes('fx')) {
    return 'forex';
  }
  if (marketLower.includes('stock') || marketLower.includes('indices') || submarketLower.includes('stock')) {
    return 'stock_indices';
  }
  if (marketLower.includes('commodit') || marketLower.includes('metals') || marketLower.includes('energy')) {
    return 'commodities';
  }
  if (marketLower.includes('crypto') || marketLower.includes('virtual')) {
    return 'cryptocurrencies';
  }
  if (marketLower.includes('synthetic') || marketLower.includes('derived') || submarketLower.includes('synthetic')) {
    return 'derived';
  }
  
  if (submarketLower.includes('forex')) return 'forex';
  if (submarketLower.includes('stock')) return 'stock_indices';
  if (submarketLower.includes('commodit')) return 'commodities';
  if (submarketLower.includes('crypto')) return 'cryptocurrencies';
  
  return 'derived';
}

/**
 * Get available instruments from Deriv API using WebSocket
 */
export async function getAvailableInstruments(): Promise<DerivInstrument[]> {
  // Always return default instruments as fallback
  const defaultInstruments = getDefaultInstruments();
  
  if (!DERIV_API_KEY) {
    console.warn('[WARN] DERIV_API_KEY not configured, using default instrument list');
    return defaultInstruments;
  }

  try {
    console.log('[INFO] Attempting to fetch instruments from Deriv API...');
    const response = await sendRequest({
      active_symbols: 1,
      product_type: 'basic',
    }, 8000); // 8 second timeout for instruments

    console.log('[INFO] Deriv API response received:', {
      hasActiveSymbols: !!response.active_symbols,
      isArray: Array.isArray(response.active_symbols),
      count: Array.isArray(response.active_symbols) ? response.active_symbols.length : 0,
    });

    if (response.active_symbols && Array.isArray(response.active_symbols) && response.active_symbols.length > 0) {
      const instruments = response.active_symbols.map((sym: any) => ({
        symbol: sym.symbol || sym.symbol_display || '',
        display_name: sym.display_name || sym.name || sym.symbol || '',
        category: mapToCategory(sym.market, sym.submarket),
        market: sym.market,
        submarket: sym.submarket,
      })).filter((inst: DerivInstrument) => inst.symbol && inst.display_name);
      
      if (instruments.length > 0) {
        console.log(`[INFO] Successfully fetched ${instruments.length} instruments from Deriv API`);
        return instruments;
      } else {
        console.warn('[WARN] No valid instruments found in API response, using defaults');
      }
    } else {
      console.warn('[WARN] Unexpected response format from Deriv API, using defaults');
    }
  } catch (error: any) {
    console.error('[ERROR] Error fetching instruments from Deriv:', error.message);
    console.error('[ERROR] Stack:', error.stack);
  }
  
  // Always return default instruments as fallback
  console.log(`[INFO] Returning ${defaultInstruments.length} default instruments`);
  return defaultInstruments;
}

export interface DerivAccountInfo {
  account_id: string;
  account_type: string;
  balance?: number;
  currency?: string;
  email?: string;
  loginid?: string;
  country?: string;
  landing_company_name?: string;
  landing_company_shortcode?: string;
  is_virtual?: number;
}

/**
 * Get list of accounts from Deriv API
 * Requires authentication token
 */
export async function getAccountList(authToken: string): Promise<DerivAccountInfo[]> {
  try {
    // Create a new connection with the auth token
    const ws = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
    let requestId = 1;
    const authReqId = requestId++;
    const accountListReqId = requestId++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Account list request timeout'));
      }, 15000);

      ws.on('open', () => {
        // First authorize with the token
        ws.send(JSON.stringify({
          authorize: authToken,
          req_id: authReqId,
        }));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.req_id === authReqId) {
            if (message.error) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(message.error.message || 'Authorization failed'));
            } else if (message.authorize) {
              // Authorization successful, now get account list
              ws.send(JSON.stringify({
                account_list: 1,
                req_id: accountListReqId,
              }));
            }
            } else if (message.req_id === accountListReqId) {
            clearTimeout(timeout);
            ws.close();

            if (message.error) {
              reject(new Error(message.error.message || 'Failed to get account list'));
            } else if (message.account_list) {
              // Handle both array and single object responses
              let accounts: any[] = [];
              if (Array.isArray(message.account_list)) {
                accounts = message.account_list;
              } else if (typeof message.account_list === 'object') {
                // If it's a single account object, wrap it in an array
                accounts = [message.account_list];
              }
              
              const accountInfos: DerivAccountInfo[] = accounts
                .filter((acc: any) => acc && (acc.loginid || acc.account_id)) // Filter out invalid accounts
                .map((acc: any) => ({
                  account_id: acc.loginid || acc.account_id || '',
                  account_type: acc.account_type || acc.landing_company_shortcode || '',
                  balance: acc.balance !== undefined && acc.balance !== null ? parseFloat(String(acc.balance)) : undefined,
                  currency: acc.currency || 'USD',
                  email: acc.email,
                  loginid: acc.loginid || acc.account_id,
                  country: acc.country,
                  landing_company_name: acc.landing_company_name,
                  landing_company_shortcode: acc.landing_company_shortcode,
                  is_virtual: acc.is_virtual !== undefined ? Number(acc.is_virtual) : undefined,
                }));

              if (accountInfos.length === 0) {
                reject(new Error('No valid accounts found in response'));
              } else {
                resolve(accountInfos);
              }
            } else {
              reject(new Error('Unexpected response format: account_list not found'));
            }
          }
        } catch (error: any) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${error.message}`));
      });
    });
  } catch (error: any) {
    throw new Error(`Failed to get account list: ${error.message}`);
  }
}

/**
 * Get default instrument list with categories
 * Comprehensive list of all Deriv symbols organized by category
 */
function getDefaultInstruments(): DerivInstrument[] {
  return [
    // ============================================
    // DERIVED/SYNTHETIC INDICES
    // ============================================
    
    // Volatility Indices
    { symbol: 'R_10', display_name: 'Volatility 10 Index', category: 'derived' },
    { symbol: 'R_25', display_name: 'Volatility 25 Index', category: 'derived' },
    { symbol: 'R_50', display_name: 'Volatility 50 Index', category: 'derived' },
    { symbol: 'R_75', display_name: 'Volatility 75 Index', category: 'derived' },
    { symbol: 'R_100', display_name: 'Volatility 100 Index', category: 'derived' },
    
    // Volatility 1s Indices
    { symbol: '1HZ10V', display_name: 'Volatility 10 (1s)', category: 'derived' },
    { symbol: '1HZ25V', display_name: 'Volatility 25 (1s)', category: 'derived' },
    { symbol: '1HZ50V', display_name: 'Volatility 50 (1s)', category: 'derived' },
    { symbol: '1HZ75V', display_name: 'Volatility 75 (1s)', category: 'derived' },
    { symbol: '1HZ100V', display_name: 'Volatility 100 (1s)', category: 'derived' },
    
    // Boom Indices
    { symbol: 'BOOM300', display_name: 'Boom 300 Index', category: 'derived' },
    { symbol: 'BOOM500', display_name: 'Boom 500 Index', category: 'derived' },
    { symbol: 'BOOM600', display_name: 'Boom 600 Index', category: 'derived' },
    { symbol: 'BOOM900', display_name: 'Boom 900 Index', category: 'derived' },
    { symbol: 'BOOM1000', display_name: 'Boom 1000 Index', category: 'derived' },
    
    // Crash Indices
    { symbol: 'CRASH300N', display_name: 'CRASH 300 INDEX', category: 'derived' },
    { symbol: 'CRASH500', display_name: 'CRASH 500 INDEX', category: 'derived' },
    { symbol: 'CRASH600', display_name: 'CRASH 600 INDEX', category: 'derived' },
    { symbol: 'CRASH900', display_name: 'CRASH 900 INDEX', category: 'derived' },
    { symbol: 'CRASH1000', display_name: 'CRASH 1000 INDEX', category: 'derived' },
    
    // Jump Indices (JD)
    { symbol: 'JD10', display_name: 'Jump 10 Index', category: 'derived' },
    { symbol: 'JD25', display_name: 'Jump 25 Index', category: 'derived' },
    { symbol: 'JD50', display_name: 'Jump 50 Index', category: 'derived' },
    { symbol: 'JD75', display_name: 'Jump 75 Index', category: 'derived' },
    { symbol: 'JD100', display_name: 'Jump 100 Index', category: 'derived' },
    
    // Range Break Indices (RB)
    { symbol: 'RB100', display_name: 'Range Break 100 Index', category: 'derived' },
    { symbol: 'RB200', display_name: 'Range Break 200 Index', category: 'derived' },
    
    // Step Indices
    { symbol: 'STPRNG', display_name: 'STEP INDEX 100', category: 'derived' },
    { symbol: 'STPRNG2', display_name: 'STEP INDEX 200', category: 'derived' },
    { symbol: 'STPRNG3', display_name: 'STEP INDEX 300', category: 'derived' },
    { symbol: 'STPRNG4', display_name: 'STEP INDEX 400', category: 'derived' },
    { symbol: 'STPRNG5', display_name: 'STEP INDEX 500', category: 'derived' },
    
    // DEX Indices
    { symbol: 'DEX900UP', display_name: 'DEX 900 UP Index', category: 'derived' },
    { symbol: 'DEX900DOWN', display_name: 'DEX 900 DOWN Index', category: 'derived' },
    
    // ============================================
    // FOREX PAIRS
    // ============================================
    
    // Major Pairs
    { symbol: 'EURUSD', display_name: 'EUR/USD', category: 'forex' },
    { symbol: 'GBPUSD', display_name: 'GBP/USD', category: 'forex' },
    { symbol: 'USDJPY', display_name: 'USD/JPY', category: 'forex' },
    { symbol: 'USDCHF', display_name: 'USD/CHF', category: 'forex' },
    { symbol: 'USDCAD', display_name: 'USD/CAD', category: 'forex' },
    { symbol: 'AUDUSD', display_name: 'AUD/USD', category: 'forex' },
    { symbol: 'NZDUSD', display_name: 'NZD/USD', category: 'forex' },
    
    // Minor Pairs
    { symbol: 'EURGBP', display_name: 'EUR/GBP', category: 'forex' },
    { symbol: 'EURJPY', display_name: 'EUR/JPY', category: 'forex' },
    { symbol: 'EURCHF', display_name: 'EUR/CHF', category: 'forex' },
    { symbol: 'EURAUD', display_name: 'EUR/AUD', category: 'forex' },
    { symbol: 'EURCAD', display_name: 'EUR/CAD', category: 'forex' },
    { symbol: 'EURNZD', display_name: 'EUR/NZD', category: 'forex' },
    { symbol: 'GBPJPY', display_name: 'GBP/JPY', category: 'forex' },
    { symbol: 'GBPCHF', display_name: 'GBP/CHF', category: 'forex' },
    { symbol: 'GBPAUD', display_name: 'GBP/AUD', category: 'forex' },
    { symbol: 'GBPCAD', display_name: 'GBP/CAD', category: 'forex' },
    { symbol: 'GBPNZD', display_name: 'GBP/NZD', category: 'forex' },
    { symbol: 'AUDJPY', display_name: 'AUD/JPY', category: 'forex' },
    { symbol: 'AUDCAD', display_name: 'AUD/CAD', category: 'forex' },
    { symbol: 'AUDCHF', display_name: 'AUD/CHF', category: 'forex' },
    { symbol: 'AUDNZD', display_name: 'AUD/NZD', category: 'forex' },
    { symbol: 'CADJPY', display_name: 'CAD/JPY', category: 'forex' },
    { symbol: 'CADCHF', display_name: 'CAD/CHF', category: 'forex' },
    { symbol: 'NZDJPY', display_name: 'NZD/JPY', category: 'forex' },
    { symbol: 'NZDCAD', display_name: 'NZD/CAD', category: 'forex' },
    { symbol: 'NZDCHF', display_name: 'NZD/CHF', category: 'forex' },
    { symbol: 'CHFJPY', display_name: 'CHF/JPY', category: 'forex' },
    
    // Exotic Pairs - USD
    { symbol: 'USDTRY', display_name: 'USD/TRY', category: 'forex' },
    { symbol: 'USDMXN', display_name: 'USD/MXN', category: 'forex' },
    { symbol: 'USDZAR', display_name: 'USD/ZAR', category: 'forex' },
    { symbol: 'USDSGD', display_name: 'USD/SGD', category: 'forex' },
    { symbol: 'USDHKD', display_name: 'USD/HKD', category: 'forex' },
    { symbol: 'USDINR', display_name: 'USD/INR', category: 'forex' },
    { symbol: 'USDBRL', display_name: 'USD/BRL', category: 'forex' },
    { symbol: 'USDRUB', display_name: 'USD/RUB', category: 'forex' },
    { symbol: 'USDCNH', display_name: 'USD/CNH', category: 'forex' },
    { symbol: 'USDKRW', display_name: 'USD/KRW', category: 'forex' },
    { symbol: 'USDTHB', display_name: 'USD/THB', category: 'forex' },
    
    // Exotic Pairs - EUR
    { symbol: 'EURTRY', display_name: 'EUR/TRY', category: 'forex' },
    { symbol: 'EURMXN', display_name: 'EUR/MXN', category: 'forex' },
    { symbol: 'EURZAR', display_name: 'EUR/ZAR', category: 'forex' },
    { symbol: 'EURSGD', display_name: 'EUR/SGD', category: 'forex' },
    { symbol: 'EURHKD', display_name: 'EUR/HKD', category: 'forex' },
    { symbol: 'EURINR', display_name: 'EUR/INR', category: 'forex' },
    { symbol: 'EURBRL', display_name: 'EUR/BRL', category: 'forex' },
    { symbol: 'EURRUB', display_name: 'EUR/RUB', category: 'forex' },
    { symbol: 'EURCNH', display_name: 'EUR/CNH', category: 'forex' },
    { symbol: 'EURKRW', display_name: 'EUR/KRW', category: 'forex' },
    { symbol: 'EURTHB', display_name: 'EUR/THB', category: 'forex' },
    
    // Exotic Pairs - GBP
    { symbol: 'GBPTRY', display_name: 'GBP/TRY', category: 'forex' },
    { symbol: 'GBPMXN', display_name: 'GBP/MXN', category: 'forex' },
    { symbol: 'GBPZAR', display_name: 'GBP/ZAR', category: 'forex' },
    { symbol: 'GBPSGD', display_name: 'GBP/SGD', category: 'forex' },
    { symbol: 'GBPHKD', display_name: 'GBP/HKD', category: 'forex' },
    { symbol: 'GBPINR', display_name: 'GBP/INR', category: 'forex' },
    { symbol: 'GBPBRL', display_name: 'GBP/BRL', category: 'forex' },
    { symbol: 'GBPRUB', display_name: 'GBP/RUB', category: 'forex' },
    { symbol: 'GBPCNH', display_name: 'GBP/CNH', category: 'forex' },
    { symbol: 'GBPKRW', display_name: 'GBP/KRW', category: 'forex' },
    { symbol: 'GBPTHB', display_name: 'GBP/THB', category: 'forex' },
    
    // Exotic Pairs - JPY
    { symbol: 'JPYTRY', display_name: 'JPY/TRY', category: 'forex' },
    { symbol: 'JPYMXN', display_name: 'JPY/MXN', category: 'forex' },
    { symbol: 'JPYZAR', display_name: 'JPY/ZAR', category: 'forex' },
    { symbol: 'JPYSGD', display_name: 'JPY/SGD', category: 'forex' },
    { symbol: 'JPYHKD', display_name: 'JPY/HKD', category: 'forex' },
    { symbol: 'JPYINR', display_name: 'JPY/INR', category: 'forex' },
    { symbol: 'JPYBRL', display_name: 'JPY/BRL', category: 'forex' },
    { symbol: 'JPYRUB', display_name: 'JPY/RUB', category: 'forex' },
    { symbol: 'JPYCNH', display_name: 'JPY/CNH', category: 'forex' },
    { symbol: 'JPYKRW', display_name: 'JPY/KRW', category: 'forex' },
    { symbol: 'JPYTHB', display_name: 'JPY/THB', category: 'forex' },
    
    // Exotic Pairs - AUD
    { symbol: 'AUDTRY', display_name: 'AUD/TRY', category: 'forex' },
    { symbol: 'AUDMXN', display_name: 'AUD/MXN', category: 'forex' },
    { symbol: 'AUDZAR', display_name: 'AUD/ZAR', category: 'forex' },
    { symbol: 'AUDSGD', display_name: 'AUD/SGD', category: 'forex' },
    { symbol: 'AUDHKD', display_name: 'AUD/HKD', category: 'forex' },
    { symbol: 'AUDINR', display_name: 'AUD/INR', category: 'forex' },
    { symbol: 'AUDBRL', display_name: 'AUD/BRL', category: 'forex' },
    { symbol: 'AUDRUB', display_name: 'AUD/RUB', category: 'forex' },
    { symbol: 'AUDCNH', display_name: 'AUD/CNH', category: 'forex' },
    { symbol: 'AUDKRW', display_name: 'AUD/KRW', category: 'forex' },
    { symbol: 'AUDTHB', display_name: 'AUD/THB', category: 'forex' },
    
    // Exotic Pairs - CAD
    { symbol: 'CADTRY', display_name: 'CAD/TRY', category: 'forex' },
    { symbol: 'CADMXN', display_name: 'CAD/MXN', category: 'forex' },
    { symbol: 'CADZAR', display_name: 'CAD/ZAR', category: 'forex' },
    { symbol: 'CADSGD', display_name: 'CAD/SGD', category: 'forex' },
    { symbol: 'CADHKD', display_name: 'CAD/HKD', category: 'forex' },
    { symbol: 'CADINR', display_name: 'CAD/INR', category: 'forex' },
    { symbol: 'CADBRL', display_name: 'CAD/BRL', category: 'forex' },
    { symbol: 'CADRUB', display_name: 'CAD/RUB', category: 'forex' },
    { symbol: 'CADCNH', display_name: 'CAD/CNH', category: 'forex' },
    { symbol: 'CADKRW', display_name: 'CAD/KRW', category: 'forex' },
    { symbol: 'CADTHB', display_name: 'CAD/THB', category: 'forex' },
    
    // Exotic Pairs - CHF
    { symbol: 'CHFTRY', display_name: 'CHF/TRY', category: 'forex' },
    { symbol: 'CHFMXN', display_name: 'CHF/MXN', category: 'forex' },
    { symbol: 'CHFZAR', display_name: 'CHF/ZAR', category: 'forex' },
    { symbol: 'CHFSGD', display_name: 'CHF/SGD', category: 'forex' },
    { symbol: 'CHFHKD', display_name: 'CHF/HKD', category: 'forex' },
    { symbol: 'CHFINR', display_name: 'CHF/INR', category: 'forex' },
    { symbol: 'CHFBRL', display_name: 'CHF/BRL', category: 'forex' },
    { symbol: 'CHFRUB', display_name: 'CHF/RUB', category: 'forex' },
    { symbol: 'CHFCNH', display_name: 'CHF/CNH', category: 'forex' },
    { symbol: 'CHFKRW', display_name: 'CHF/KRW', category: 'forex' },
    { symbol: 'CHFTHB', display_name: 'CHF/THB', category: 'forex' },
    
    // ============================================
    // STOCK INDICES
    // ============================================
    
    { symbol: 'OTC_NDX', display_name: 'Nasdaq 100', category: 'stock_indices' },
    { symbol: 'OTC_SPX', display_name: 'S&P 500', category: 'stock_indices' },
    { symbol: 'OTC_DJI', display_name: 'Dow Jones 30', category: 'stock_indices' },
    
    // ============================================
    // COMMODITIES
    // ============================================
    
    { symbol: 'FRXXAUUSD', display_name: 'GOLD/USD', category: 'commodities' },
    { symbol: 'FRXXPDUSD', display_name: 'PALLADIUM/USD', category: 'commodities' },
    { symbol: 'FRXXPTUSD', display_name: 'PLATINUM/USD', category: 'commodities' },
    { symbol: 'FRXXAGUSD', display_name: 'SILVER/USD', category: 'commodities' },
    
    // ============================================
    // CRYPTOCURRENCIES
    // ============================================
    
    { symbol: 'CRYBTCUSD', display_name: 'BTC/USD', category: 'cryptocurrencies' },
    { symbol: 'CRYETHUSD', display_name: 'ETH/USD', category: 'cryptocurrencies' },
  ];
}

// ============================================
// TRADING FUNCTIONS
// ============================================

export interface ContractProposalParams {
  amount: number;
  basis: 'stake' | 'payout';
  contract_type: 'CALL' | 'PUT' | 'RISE' | 'FALL' | 'HIGHER' | 'LOWER';
  currency: string;
  duration: number;
  duration_unit: 's' | 'm' | 'h' | 'd' | 't';
  symbol: string;
}

export interface ContractProposal {
  id: string;
  ask_price: number;
  date_start: number;
  payout: number;
  spot: number;
}

/**
 * Get contract proposal from Deriv API
 */
export async function getContractProposal(
  params: ContractProposalParams
): Promise<{ proposal: ContractProposal }> {
  try {
    const response = await sendRequest({
      proposal: 1,
      amount: params.amount,
      basis: params.basis,
      contract_type: params.contract_type,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,
    }, 10000);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get contract proposal');
    }

    if (!response.proposal) {
      throw new Error('No proposal returned from API');
    }

    return {
      proposal: {
        id: response.proposal.id,
        ask_price: parseFloat(response.proposal.ask_price || response.proposal.price || '0'),
        date_start: response.proposal.date_start || Date.now() / 1000,
        payout: parseFloat(response.proposal.payout || '0'),
        spot: parseFloat(response.proposal.spot || '0'),
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to get contract proposal: ${error.message}`);
  }
}

/**
 * Buy a contract using proposal ID
 */
export async function buyContract(
  proposalId: string,
  price: number
): Promise<{ contract_id: string; buy_price: number }> {
  try {
    const response = await sendRequest({
      buy: proposalId,
      price: price,
    }, 15000);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to buy contract');
    }

    if (!response.buy) {
      throw new Error('No buy response from API');
    }

    return {
      contract_id: response.buy.contract_id || response.buy.contractId,
      buy_price: parseFloat(response.buy.buy_price || response.buy.price || '0'),
    };
  } catch (error: any) {
    throw new Error(`Failed to buy contract: ${error.message}`);
  }
}

/**
 * Sell a contract (close position)
 */
export async function sellContract(
  contractId: string,
  price: number = 0
): Promise<{ sell_price: number; profit: number }> {
  try {
    const response = await sendRequest({
      sell: contractId,
      price: price, // 0 = sell at market
    }, 15000);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to sell contract');
    }

    if (!response.sell) {
      throw new Error('No sell response from API');
    }

    return {
      sell_price: parseFloat(response.sell.sell_price || response.sell.price || '0'),
      profit: parseFloat(response.sell.profit || '0'),
    };
  } catch (error: any) {
    throw new Error(`Failed to sell contract: ${error.message}`);
  }
}

/**
 * Get portfolio (active contracts)
 */
export async function getPortfolio(): Promise<any[]> {
  try {
    const response = await sendRequest({
      portfolio: 1,
    }, 10000);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get portfolio');
    }

    if (response.portfolio) {
      // Handle both array and object responses
      if (Array.isArray(response.portfolio)) {
        return response.portfolio;
      } else if (typeof response.portfolio === 'object') {
        return [response.portfolio];
      }
    }

    return [];
  } catch (error: any) {
    throw new Error(`Failed to get portfolio: ${error.message}`);
  }
}

/**
 * Get contract information
 */
export async function getContractInfo(contractId: string): Promise<any> {
  try {
    const response = await sendRequest({
      contract_info: 1,
      contract_id: contractId,
    }, 10000);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get contract info');
    }

    return response.contract_info || response;
  } catch (error: any) {
    throw new Error(`Failed to get contract info: ${error.message}`);
  }
}

/**
 * Determine contract type based on symbol and direction
 */
export function getContractType(symbol: string, direction: 'long' | 'short'): 'CALL' | 'PUT' | 'RISE' | 'FALL' {
  const upperSymbol = symbol.toUpperCase();
  
  // Synthetic indices use RISE/FALL
  if (upperSymbol.startsWith('R_') || 
      upperSymbol.startsWith('1HZ') ||
      upperSymbol.startsWith('BOOM') ||
      upperSymbol.startsWith('CRASH') ||
      upperSymbol.startsWith('JD') ||
      upperSymbol.startsWith('RB') ||
      upperSymbol.startsWith('STPRNG') ||
      upperSymbol.startsWith('DEX')) {
    return direction === 'long' ? 'RISE' : 'FALL';
  }
  
  // Forex and other instruments use CALL/PUT
  return direction === 'long' ? 'CALL' : 'PUT';
}
