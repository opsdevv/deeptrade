// Data Fetcher - Combines Deriv API and processing

import { TimeframeData, Timeframe } from '@/types/analysis';
import { fetchMarketData } from '@/lib/api/deriv';
import { normalizeData, enforce48hWindow, validateData } from './processor';

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
      
      const rawData = await fetchMarketData(symbol, tf, 500); // Get more data than needed
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:22',message:'Raw data received',data:{timeframe:tf,rawDataLength:rawData?.length||0,firstItem:rawData?.[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const normalized = normalizeData(rawData);
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:26',message:'After normalization',data:{timeframe:tf,normalizedLength:normalized?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      const validated = enforce48hWindow(normalized);
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:30',message:'After 48h window',data:{timeframe:tf,validatedLength:validated?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
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
      
      return { timeframe: tf, data: validated };
    } catch (error) {
      console.error(`Error fetching ${tf} data:`, error);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:52',message:'Error caught in timeframe fetch',data:{timeframe:tf,error:error instanceof Error?error.message:String(error),errorStack:error instanceof Error?error.stack:undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return { timeframe: tf, data: [] };
    }
  });

  const results = await Promise.all(promises);

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:59',message:'All promises resolved',data:{resultsCount:results.length,results:results.map(r=>({timeframe:r.timeframe,dataLength:r.data.length}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  results.forEach(({ timeframe, data }) => {
    result[timeframe] = data;
  });

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/fetcher.ts:65',message:'fetchMarketDataForTimeframes exit',data:{'2h_count':result['2h']?.length||0,'15m_count':result['15m']?.length||0,'5m_count':result['5m']?.length||0,resultKeys:Object.keys(result)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return result as Record<Timeframe, TimeframeData[]>;
}

