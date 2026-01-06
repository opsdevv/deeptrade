// Main Analysis Engine - Orchestrator

import {
  TimeframeData,
  AnalysisResult,
  SignalType,
  InstrumentConfig,
} from '@/types/analysis';
import { analyze2HBias } from './timeframe-2h';
import { analyze15mLiquidity } from './timeframe-15m';
import { analyze5mExecution } from './timeframe-5m';
import { isValidSessionTime } from './session-filter';
import {
  getInstrumentConfig,
  applyInstrumentRules,
  validateInstrumentAnalysis,
} from './instruments';
import { getLatestSwingPoints } from '@/lib/ict/support-resistance';

/**
 * Main analysis function - orchestrates 2H → 15m → 5m analysis
 */
export function analyze(
  instrument: string,
  data: {
    '2h': TimeframeData[];
    '15m': TimeframeData[];
    '5m': TimeframeData[];
  }
): AnalysisResult {
  // Validate data exists
  if (!data['2h'] || !data['15m'] || !data['5m']) {
    throw new Error('Missing timeframe data');
  }

  // Note: 48h window validation removed - allowing data to exceed 48 hours as needed
  // validate48hWindow(data);

  const timestamp = Date.now();
  const now = new Date();

  // Get instrument configuration
  const instrumentConfig = getInstrumentConfig(instrument);

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/engine.ts:44',message:'Before analyze2HBias',data:{'2h_length':data['2h']?.length||0,'2h_type':typeof data['2h'],'2h_isArray':Array.isArray(data['2h']),'2h_first':data['2h']?.[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Step 1: 2H Analysis (Bias Engine)
  const biasAnalysis = analyze2HBias(data['2h']);

  // If no clear bias, return NO_TRADE
  if (biasAnalysis.bias === 'neutral') {
    return createNoTradeResult(
      instrument,
      timestamp,
      data,
      instrumentConfig,
      biasAnalysis,
      'No clear bias from 2H analysis'
    );
  }

  // Step 2: 15m Analysis (Liquidity & Setup Filter)
  const liquidityAnalysis = analyze15mLiquidity(data['15m'], biasAnalysis);

  // If setup is not valid, return WATCH
  if (!liquidityAnalysis.setup_valid) {
    return createWatchResult(
      instrument,
      timestamp,
      data,
      instrumentConfig,
      biasAnalysis,
      liquidityAnalysis,
      'Setup not valid - waiting for conditions'
    );
  }

  // Step 3: 5m Analysis (Execution Signals)
  const executionSignal = analyze5mExecution(
    data['5m'],
    biasAnalysis,
    liquidityAnalysis,
    instrument
  );

  // If no trade signal, return WATCH
  if (!executionSignal.trade_signal) {
    return createWatchResult(
      instrument,
      timestamp,
      data,
      instrumentConfig,
      biasAnalysis,
      liquidityAnalysis,
      'No valid execution signal on 5m'
    );
  }

  // Step 4: Session Filter
  const sessionValid = isValidSessionTime(
    now,
    instrument,
    instrumentConfig.type
  );

  // If session not valid and required, return WATCH
  if (instrumentConfig.use_session_filter && !sessionValid) {
    return createWatchResult(
      instrument,
      timestamp,
      data,
      instrumentConfig,
      biasAnalysis,
      liquidityAnalysis,
      'Outside valid trading session'
    );
  }

  // Step 5: Create TRADE_SETUP result
  const result: AnalysisResult = {
    instrument,
    timestamp,
    data_window_start: getDataWindowStart(data),
    data_window_end: timestamp,
    timeframe_2h: biasAnalysis,
    timeframe_15m: liquidityAnalysis,
    timeframe_5m: executionSignal,
    final_decision: 'TRADE_SETUP',
    session_valid: sessionValid,
    instrument_config: instrumentConfig,
  };

  // Step 6: Apply instrument-specific rules
  const finalResult = applyInstrumentRules(result, instrument);

  // Step 7: Final validation
  if (!validateInstrumentAnalysis(finalResult, instrument)) {
    finalResult.final_decision = 'WATCH';
  }

  return finalResult;
}

/**
 * Validate 48h data window
 */
function validate48hWindow(data: {
  '2h': TimeframeData[];
  '15m': TimeframeData[];
  '5m': TimeframeData[];
}): void {
  const now = Date.now() / 1000; // Convert to seconds
  const maxAge = 48 * 60 * 60; // 48 hours in seconds

  // Check 2H data
  if (data['2h'].length > 0) {
    const oldest2H = data['2h'][0].time;
    if (now - oldest2H > maxAge) {
      throw new Error('2H data exceeds 48h window');
    }
  }

  // Check 15m data
  if (data['15m'].length > 0) {
    const oldest15m = data['15m'][0].time;
    if (now - oldest15m > maxAge) {
      throw new Error('15m data exceeds 48h window');
    }
  }

  // Check 5m data
  if (data['5m'].length > 0) {
    const oldest5m = data['5m'][0].time;
    if (now - oldest5m > maxAge) {
      throw new Error('5m data exceeds 48h window');
    }
  }
}

/**
 * Get data window start timestamp
 */
function getDataWindowStart(data: {
  '2h': TimeframeData[];
  '15m': TimeframeData[];
  '5m': TimeframeData[];
}): number {
  const times: number[] = [];

  if (data['2h'].length > 0) times.push(data['2h'][0].time);
  if (data['15m'].length > 0) times.push(data['15m'][0].time);
  if (data['5m'].length > 0) times.push(data['5m'][0].time);

  return times.length > 0 ? Math.min(...times) * 1000 : Date.now(); // Convert to milliseconds
}

/**
 * Create NO_TRADE result
 */
function createNoTradeResult(
  instrument: string,
  timestamp: number,
  data: { '2h': TimeframeData[]; '15m': TimeframeData[]; '5m': TimeframeData[] },
  instrumentConfig: InstrumentConfig,
  biasAnalysis: any,
  reason: string
): AnalysisResult {
  const swing15m = getLatestSwingPoints(data['15m'], 5);
  const swing5m = getLatestSwingPoints(data['5m'], 5);

  return {
    instrument,
    timestamp,
    data_window_start: getDataWindowStart(data),
    data_window_end: timestamp,
    timeframe_2h: biasAnalysis,
    timeframe_15m: {
      liquidity_taken: false,
      liquidity_type: null,
      reaction_strength: null,
      fvg_present: false,
      setup_valid: false,
      displacement_detected: false,
      liquidity_sweeps: [],
      fvgs: [],
      displacement: [],
      swing_highs: swing15m.highs,
      swing_lows: swing15m.lows,
    },
    timeframe_5m: {
      trade_signal: false,
      direction: null,
      entry_zone: '',
      stop_level: '',
      target_zone: '',
      confidence: 'low',
      mss_confirmed: false,
      fvg_details: null,
      entry_price: null,
      stop_price: null,
      target_price: null,
      risk_reward_ratio: null,
      swing_highs: swing5m.highs,
      swing_lows: swing5m.lows,
    },
    final_decision: 'NO_TRADE',
    session_valid: false,
    instrument_config: instrumentConfig,
  };
}

/**
 * Create WATCH result
 */
function createWatchResult(
  instrument: string,
  timestamp: number,
  data: { '2h': TimeframeData[]; '15m': TimeframeData[]; '5m': TimeframeData[] },
  instrumentConfig: InstrumentConfig,
  biasAnalysis: any,
  liquidityAnalysis: any,
  reason: string
): AnalysisResult {
  const swing5m = getLatestSwingPoints(data['5m'], 5);

  return {
    instrument,
    timestamp,
    data_window_start: getDataWindowStart(data),
    data_window_end: timestamp,
    timeframe_2h: biasAnalysis,
    timeframe_15m: liquidityAnalysis,
    timeframe_5m: {
      trade_signal: false,
      direction: null,
      entry_zone: '',
      stop_level: '',
      target_zone: '',
      confidence: 'low',
      mss_confirmed: false,
      fvg_details: null,
      entry_price: null,
      stop_price: null,
      target_price: null,
      risk_reward_ratio: null,
      swing_highs: swing5m.highs,
      swing_lows: swing5m.lows,
    },
    final_decision: 'WATCH',
    session_valid: isValidSessionTime(new Date(), instrument, instrumentConfig.type),
    instrument_config: instrumentConfig,
  };
}

