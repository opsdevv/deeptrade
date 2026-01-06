// Data Fetcher - Combines Deriv API and processing

import { TimeframeData, Timeframe } from '@/types/analysis';
import { fetchMarketData } from '@/lib/api/deriv';
import { normalizeData, validateData } from './processor';
import { redisCache, CacheKeys } from '@/lib/redis/client';

/**
 * Fetch and process market data for multiple timeframes
 */
export async function fetchMarketDataForTimeframes(
  symbol: string,
  timeframes: Timeframe[]
): Promise<Record<Timeframe, TimeframeData[]>> {
  const result: Record<string, TimeframeData[]> = {};

  // Fetch data for each timeframe in parallel
  const promises = timeframes.map(async (tf) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:17',message:'Starting fetch for timeframe',data:{symbol,timeframe:tf},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Check Redis cache first
      const cacheKey = CacheKeys.marketData(symbol, tf);
      const cachedData = await redisCache.get<TimeframeData[]>(cacheKey);
      
      if (cachedData && cachedData.length > 0) {
        console.log(`[Cache] Using cached market data for ${symbol} ${tf}`);
        return { timeframe: tf, data: cachedData };
      }
      
      // Fetch from API if not in cache
      const rawData = await fetchMarketData(symbol, tf, 500); // Get more data than needed
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:22',message:'Raw data received',data:{timeframe:tf,rawDataLength:rawData?.length||0,firstItem:rawData?.[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const normalized = normalizeData(rawData);
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:26',message:'After normalization',data:{timeframe:tf,normalizedLength:normalized?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Note: 48h window filtering removed - allowing data to exceed 48 hours as needed
      // const validated = enforce48hWindow(normalized);
      const validated = normalized; // Use all data without 48h filtering
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:30',message:'After normalization (48h filter disabled)',data:{timeframe:tf,validatedLength:validated?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      const validation = validateData(validated);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:41',message:'Validation result',data:{timeframe:tf,valid:validation.valid,errors:validation.errors,validatedLength:validated.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      if (!validation.valid) {
        console.warn(`Validation warnings for ${tf}:`, validation.errors);
      }

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:49',message:'Successfully processed timeframe',data:{timeframe:tf,validatedLength:validated.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Cache the processed data (TTL: 5 minutes for 5m, 15 minutes for 15m, 30 minutes for 2h)
      const ttl = tf === '5m' ? 300 : tf === '15m' ? 900 : 1800;
      await redisCache.set(cacheKey, validated, ttl);
      
      return { timeframe: tf, data: validated };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR] Error fetching ${tf} data for ${symbol}:`, errorMessage);
      console.error(`[ERROR] Full error:`, error);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:52',message:'Error caught in timeframe fetch',data:{symbol,timeframe:tf,error:errorMessage,errorStack:error instanceof Error?error.stack:undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Return empty array but log the error for debugging
      return { timeframe: tf, data: [], error: errorMessage };
    }
  });

  const results = await Promise.all(promises);

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:59',message:'All promises resolved',data:{resultsCount:results.length,results:results.map(r=>({timeframe:r.timeframe,dataLength:r.data.length}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const errors: string[] = [];
  results.forEach(({ timeframe, data, error }: any) => {
    result[timeframe] = data;
    if (error && data.length === 0) {
      errors.push(`${timeframe}: ${error}`);
    }
  });

  // Log if any timeframes failed
  if (errors.length > 0) {
    console.error(`[ERROR] Failed to fetch data for ${symbol}:`, errors.join('; '));
    // Check for common issues
    const allErrors = errors.join(' ').toLowerCase();
    if (allErrors.includes('environment variable') || allErrors.includes('required')) {
      console.error(`[ERROR] Missing environment variables. Please check: DERIV_WS_URL, DERIV_APP_ID, DERIV_API_KEY`);
    }
    if (allErrors.includes('connection') || allErrors.includes('websocket')) {
      console.error(`[ERROR] WebSocket connection issue. Check network connectivity and API endpoint.`);
    }
    if (allErrors.includes('symbol') || allErrors.includes('not available')) {
      console.error(`[ERROR] Symbol format issue. Tried: ${symbol}. Check if symbol is available on Deriv.`);
    }
  }

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:65',message:'fetchMarketDataForTimeframes exit',data:{symbol,'2h_count':result['2h']?.length||0,'15m_count':result['15m']?.length||0,'5m_count':result['5m']?.length||0,resultKeys:Object.keys(result),errors:errors.length>0?errors:undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return result as Record<Timeframe, TimeframeData[]>;
}

