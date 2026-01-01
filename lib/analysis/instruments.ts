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

  // Volatility indices
  if (symbolForMatching.includes('VOLATILITY') || symbolForMatching.includes('V50')) {
    return {
      symbol: upperSymbol,
      type: 'synthetic',
      use_session_filter: false,
      prioritize_mss: true,
      ignore_order_blocks: true,
      full_ict_model: false,
    };
  }

  // Forex pairs and commodities (check both with and without frx prefix)
  if (
    symbolForMatching === 'XAUUSD' ||
    symbolForMatching === 'GBPJPY' ||
    symbolForMatching === 'GBPUSD' ||
    symbolForMatching === 'XAGUSD'
  ) {
    return {
      symbol: upperSymbol,
      type: 'forex',
      use_session_filter: true,
      prioritize_mss: false,
      ignore_order_blocks: false,
      full_ict_model: true,
    };
  }

  // Default configuration
  return {
    symbol: upperSymbol,
    type: 'forex',
    use_session_filter: true,
    prioritize_mss: false,
    ignore_order_blocks: false,
    full_ict_model: true,
  };
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

