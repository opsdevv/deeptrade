// Instrument-Specific Logic

import {
  InstrumentConfig,
  InstrumentType,
  AnalysisResult,
  SignalType,
} from '@/types/analysis';

/**
 * Get instrument configuration
 * Handles both original symbols (XAUUSD) and normalized symbols (frxXAUUSD)
 */
export function getInstrumentConfig(symbol: string): InstrumentConfig {
  const upperSymbol = symbol.toUpperCase();
  // Remove frx prefix if present for matching logic
  const symbolForMatching = upperSymbol.startsWith('FRX') ? upperSymbol.substring(3) : upperSymbol;

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/instruments.ts:14',message:'getInstrumentConfig entry',data:{symbol,upperSymbol,symbolForMatching},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Volatility indices
  if (symbolForMatching.includes('VOLATILITY') || symbolForMatching.includes('V50')) {
    const config: InstrumentConfig = {
      symbol: upperSymbol,
      type: 'synthetic' as InstrumentType,
      use_session_filter: false,
      prioritize_mss: true,
      ignore_order_blocks: true,
      full_ict_model: false,
    };
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/instruments.ts:20',message:'getInstrumentConfig matched volatility',data:{symbol,config},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return config;
  }

  // Forex pairs and commodities (check both with and without frx prefix)
  if (
    symbolForMatching === 'XAUUSD' ||
    symbolForMatching === 'GBPJPY' ||
    symbolForMatching === 'GBPUSD' ||
    symbolForMatching === 'XAGUSD'
  ) {
    const config: InstrumentConfig = {
      symbol: upperSymbol,
      type: 'forex' as InstrumentType,
      use_session_filter: true,
      prioritize_mss: false,
      ignore_order_blocks: false,
      full_ict_model: true,
    };
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/instruments.ts:32',message:'getInstrumentConfig matched specific forex/commodity',data:{symbol,config},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return config;
  }

  // Default configuration
  const defaultConfig: InstrumentConfig = {
    symbol: upperSymbol,
    type: 'forex' as InstrumentType,
    use_session_filter: true,
    prioritize_mss: false,
    ignore_order_blocks: false,
    full_ict_model: true,
  };
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/instruments.ts:49',message:'getInstrumentConfig using default config',data:{symbol,config:defaultConfig},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  return defaultConfig;
}

/**
 * Apply instrument-specific rules to analysis
 */
export function applyInstrumentRules(
  analysis: AnalysisResult,
  instrument: string
): AnalysisResult {
  const config = getInstrumentConfig(instrument);

  // Volatility/V50 specific rules
  if (config.type === 'synthetic' && config.prioritize_mss) {
    // Prioritize MSS + displacement, ignore order blocks
    if (!analysis.timeframe_5m.mss_confirmed) {
      // If no MSS, downgrade to WATCH or NO_TRADE
      if (analysis.final_decision === 'TRADE_SETUP') {
        analysis.final_decision = 'WATCH';
      }
    }

    // Ignore order blocks in bias analysis
    if (config.ignore_order_blocks) {
      analysis.timeframe_2h.order_blocks = [];
    }
  }

  // XAUUSD/GBPJPY full ICT model
  if (config.full_ict_model) {
    // Full ICT model requires:
    // 1. Session timing (already validated)
    // 2. All FVGs present
    // 3. Strong displacement
    if (analysis.final_decision === 'TRADE_SETUP') {
      const hasFVGs =
        analysis.timeframe_2h.fvgs.length > 0 &&
        analysis.timeframe_15m.fvgs.length > 0 &&
        analysis.timeframe_5m.fvg_details !== null;

      const hasStrongDisplacement =
        analysis.timeframe_15m.displacement_detected &&
        analysis.timeframe_5m.mss_confirmed;

      if (!hasFVGs || !hasStrongDisplacement) {
        analysis.final_decision = 'WATCH';
      }
    }
  }

  // Update instrument config in result
  analysis.instrument_config = config;

  return analysis;
}

/**
 * Validate analysis based on instrument type
 */
export function validateInstrumentAnalysis(
  analysis: AnalysisResult,
  instrument: string
): boolean {
  const config = getInstrumentConfig(instrument);

  // Volatility indices: Must have MSS
  if (config.prioritize_mss && !analysis.timeframe_5m.mss_confirmed) {
    return false;
  }

  // Forex pairs: Must have session validation
  if (config.use_session_filter && !analysis.session_valid) {
    return false;
  }

  return true;
}

