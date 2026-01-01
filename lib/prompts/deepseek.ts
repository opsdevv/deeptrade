// DeepSeek Prompt Generator

import { AnalysisResult } from '@/types/analysis';
import { formatPrice, formatPriceArray } from '@/lib/utils/price-format';

/**
 * Generate DeepSeek prompt from analysis results
 */
export function generatePrompt(
  analysis: AnalysisResult,
  instrument: string
): string {
  const prompt = `You are an ICT/SMC scalping analysis engine.

Analyze ONLY the previous 48 hours of price data.
Timeframes: 2H (bias), 15m (liquidity & setup), 5m (execution).

Use ICT Inner Circle concepts only:
- Liquidity sweeps
- Premium / Discount
- Fair Value Gaps
- Market Structure Shift
- Displacement

Do NOT generate trades unless:
- 2H bias is clear
- Liquidity has been taken
- 5m MSS + FVG are present
- Setup aligns with bias

## Current Analysis Results:

**Instrument:** ${instrument}
**Analysis Timestamp:** ${new Date(analysis.timestamp).toISOString()}
**Final Decision:** ${analysis.final_decision}
**Session Valid:** ${analysis.session_valid}

### 2H Bias Analysis:
- Bias: ${analysis.timeframe_2h.bias}
- Range: ${formatPrice(analysis.timeframe_2h.range_low, instrument)} - ${formatPrice(analysis.timeframe_2h.range_high, instrument)}
- Premium/Discount: ${analysis.timeframe_2h.premium_discount} (PD Level: ${formatPrice(analysis.timeframe_2h.pd_level, instrument)})
- Key Liquidity:
  - Buy-side: ${formatPriceArray(analysis.timeframe_2h.key_liquidity.buy_side, instrument)}
  - Sell-side: ${formatPriceArray(analysis.timeframe_2h.key_liquidity.sell_side, instrument)}
- FVGs Detected: ${analysis.timeframe_2h.fvgs.length}
- Order Blocks: ${analysis.timeframe_2h.order_blocks.length}
- HTF Zone: ${analysis.timeframe_2h.htf_zone}

### 15m Liquidity Analysis:
- Liquidity Taken: ${analysis.timeframe_15m.liquidity_taken}
- Liquidity Type: ${analysis.timeframe_15m.liquidity_type || 'N/A'}
- Reaction Strength: ${analysis.timeframe_15m.reaction_strength || 'N/A'}
- FVG Present: ${analysis.timeframe_15m.fvg_present}
- Setup Valid: ${analysis.timeframe_15m.setup_valid}
- Displacement Detected: ${analysis.timeframe_15m.displacement_detected}
- Liquidity Sweeps: ${analysis.timeframe_15m.liquidity_sweeps.length}

### 5m Execution Signal:
- Trade Signal: ${analysis.timeframe_5m.trade_signal}
- Direction: ${analysis.timeframe_5m.direction || 'N/A'}
- Entry Zone: ${analysis.timeframe_5m.entry_zone || 'N/A'} (${formatPrice(analysis.timeframe_5m.entry_price, instrument)})
- Stop Level: ${analysis.timeframe_5m.stop_level || 'N/A'} (${formatPrice(analysis.timeframe_5m.stop_price, instrument)})
- Target Zone: ${analysis.timeframe_5m.target_zone || 'N/A'} (${formatPrice(analysis.timeframe_5m.target_price, instrument)})
- Confidence: ${analysis.timeframe_5m.confidence}
- MSS Confirmed: ${analysis.timeframe_5m.mss_confirmed}
- Risk/Reward: ${analysis.timeframe_5m.risk_reward_ratio ? analysis.timeframe_5m.risk_reward_ratio.toFixed(2) : 'N/A'}

### Instrument Configuration:
- Type: ${analysis.instrument_config.type}
- Use Session Filter: ${analysis.instrument_config.use_session_filter}
- Prioritize MSS: ${analysis.instrument_config.prioritize_mss}
- Full ICT Model: ${analysis.instrument_config.full_ict_model}

## Your Task:

Review this analysis and provide a structured JSON response with:
1. Validation of the analysis logic
2. Any additional insights or concerns
3. Final recommendation (NO_TRADE, WATCH, or TRADE_SETUP)
4. Confidence level
5. Key factors supporting the decision

Output structured JSON only.
If conditions are not met, return NO_TRADE.

Format your response as JSON:
{
  "validation": {
    "bias_valid": true/false,
    "liquidity_valid": true/false,
    "execution_valid": true/false,
    "session_valid": true/false
  },
  "insights": ["insight1", "insight2"],
  "recommendation": "NO_TRADE | WATCH | TRADE_SETUP",
  "confidence": "low | medium | high",
  "key_factors": ["factor1", "factor2"],
  "concerns": ["concern1", "concern2"]
}`;

  return prompt;
}

