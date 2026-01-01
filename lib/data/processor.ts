// Data Processing Utilities

import { TimeframeData } from '@/types/analysis';

/**
 * Normalize OHLCV data
 */
export function normalizeData(data: any[]): TimeframeData[] {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:8',message:'normalizeData entry',data:{inputLength:data.length,firstItem:data[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const mapped = data.map((item) => {
      // Handle different data formats
      const time = item.time || item.timestamp || item.epoch || Date.now() / 1000;
      const open = parseFloat(item.open || item.O || 0);
      const high = parseFloat(item.high || item.H || 0);
      const low = parseFloat(item.low || item.L || 0);
      const close = parseFloat(item.close || item.C || 0);
      const volume = item.volume || item.V || undefined;

      return {
        time: typeof time === 'number' ? time : new Date(time).getTime() / 1000,
        open,
        high,
        low,
        close,
        volume: volume ? parseFloat(volume.toString()) : undefined,
      };
    });
    
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:25',message:'After mapping',data:{mappedLength:mapped.length,firstMapped:mapped[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const filtered = mapped.filter((item) => item.time > 0 && item.open > 0 && item.high > 0 && item.low > 0 && item.close > 0);
  
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:28',message:'After filtering',data:{filteredLength:filtered.length,filteredOut:mapped.length-filtered.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const sorted = filtered.sort((a, b) => a.time - b.time);
  
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:30',message:'normalizeData exit',data:{outputLength:sorted.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  return sorted;
}

/**
 * Enforce 48h window on data
 */
export function enforce48hWindow(data: TimeframeData[]): TimeframeData[] {
  const now = Date.now() / 1000; // Current time in seconds
  const maxAge = 48 * 60 * 60; // 48 hours in seconds
  const cutoffTime = now - maxAge;

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:35',message:'enforce48hWindow entry',data:{inputLength:data.length,now,cutoffTime,oldestTime:data[0]?.time||null,newestTime:data[data.length-1]?.time||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  const filtered = data.filter((item) => item.time >= cutoffTime);

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data/processor.ts:40',message:'enforce48hWindow exit',data:{outputLength:filtered.length,filteredOut:data.length-filtered.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  return filtered;
}

/**
 * Validate data quality
 */
export function validateData(data: TimeframeData[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (data.length === 0) {
    errors.push('No data provided');
    return { valid: false, errors };
  }

  // Check for required fields
  data.forEach((item, index) => {
    if (!item.time || item.time <= 0) {
      errors.push(`Item ${index}: Invalid time`);
    }
    if (item.high < item.low) {
      errors.push(`Item ${index}: High < Low`);
    }
    if (item.open < item.low || item.open > item.high) {
      errors.push(`Item ${index}: Open outside High/Low range`);
    }
    if (item.close < item.low || item.close > item.high) {
      errors.push(`Item ${index}: Close outside High/Low range`);
    }
  });

  // Check for chronological order
  for (let i = 1; i < data.length; i++) {
    if (data[i].time < data[i - 1].time) {
      errors.push('Data not in chronological order');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

