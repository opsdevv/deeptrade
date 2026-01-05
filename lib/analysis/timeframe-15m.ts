// 15m Timeframe Analysis - Liquidity & Setup Filter

import {
  TimeframeData,
  LiquidityAnalysis,
  BiasAnalysis,
  ReactionStrength,
} from '@/types/analysis';
import { detectFVGs } from '@/lib/ict/fvg';
import { detectDisplacement, isStrongDisplacement } from '@/lib/ict/displacement';
import {
  isLiquiditySwept,
  detectEqualHighs,
  detectEqualLows,
  getAsianRange,
} from '@/lib/ict/liquidity';
import { isInPremium, isInDiscount } from '@/lib/ict/premium-discount';
import { getLatestSwingPoints } from '@/lib/ict/support-resistance';

/**
 * Analyze 15m timeframe for liquidity sweeps and setup validation
 */
export function analyze15mLiquidity(
  data: TimeframeData[],
  bias: BiasAnalysis
): LiquidityAnalysis {
  if (data.length === 0) {
    throw new Error('No data provided for 15m analysis');
  }

  // Enforce 48h window (last 2 days = 192 candles on 15m)
  const maxCandles = 192;
  const recentData = data.slice(-maxCandles);

  // Detect liquidity pools
  const equalHighs = detectEqualHighs(recentData);
  const equalLows = detectEqualLows(recentData);

  // Get Asian range
  const asianRange = getAsianRange(recentData);

  // Check for liquidity sweeps
  const liquiditySweeps: Array<{
    price: number;
    time: number;
    type: 'buy-side' | 'sell-side';
  }> = [];

  // Check buy-side liquidity (equal lows)
  equalLows.forEach((price) => {
    if (isLiquiditySwept(price, recentData, 'buy-side')) {
      const sweepCandle = recentData.find(
        (c) => c.low < price && c.high > price
      );
      if (sweepCandle) {
        liquiditySweeps.push({
          price,
          time: sweepCandle.time,
          type: 'buy-side',
        });
      }
    }
  });

  // Check sell-side liquidity (equal highs)
  equalHighs.forEach((price) => {
    if (isLiquiditySwept(price, recentData, 'sell-side')) {
      const sweepCandle = recentData.find(
        (c) => c.high > price && c.low < price
      );
      if (sweepCandle) {
        liquiditySweeps.push({
          price,
          time: sweepCandle.time,
          type: 'sell-side',
        });
      }
    }
  });

  // Check Asian range liquidity
  if (asianRange) {
    // Check if Asian range high was swept
    if (isLiquiditySwept(asianRange.high, recentData, 'sell-side')) {
      const sweepCandle = recentData.find(
        (c) => c.high > asianRange.high && c.low < asianRange.high
      );
      if (sweepCandle) {
        liquiditySweeps.push({
          price: asianRange.high,
          time: sweepCandle.time,
          type: 'sell-side',
        });
      }
    }

    // Check if Asian range low was swept
    if (isLiquiditySwept(asianRange.low, recentData, 'buy-side')) {
      const sweepCandle = recentData.find(
        (c) => c.low < asianRange.low && c.high > asianRange.low
      );
      if (sweepCandle) {
        liquiditySweeps.push({
          price: asianRange.low,
          time: sweepCandle.time,
          type: 'buy-side',
        });
      }
    }
  }

  // Check if liquidity was taken
  const liquidityTaken = liquiditySweeps.length > 0;

  // Determine liquidity type from most recent sweep
  const latestSweep = liquiditySweeps.length > 0
    ? liquiditySweeps.reduce((latest, current) =>
        current.time > latest.time ? current : latest
      )
    : null;

  const liquidityType = latestSweep ? latestSweep.type : null;

  // Check reaction strength after liquidity sweep
  const reactionStrength = latestSweep
    ? checkReactionStrength(latestSweep, recentData, bias)
    : null;

  // Verify price is in correct PD zone aligned with bias
  const currentPrice = recentData[recentData.length - 1].close;
  const priceInCorrectZone =
    (bias.bias === 'bullish' && isInDiscount(currentPrice, bias.range_high, bias.range_low)) ||
    (bias.bias === 'bearish' && isInPremium(currentPrice, bias.range_high, bias.range_low)) ||
    bias.bias === 'neutral';

  // Detect displacement
  const displacement = detectDisplacement(recentData, '15m');
  const displacementDetected = displacement.length > 0;
  const strongDisplacement = displacement.some((d) => isStrongDisplacement(d));

  // Detect FVGs aligned with bias
  const fvgs = detectFVGs(recentData, '15m');
  const alignedFVGs = fvgs.filter((fvg) => {
    if (bias.bias === 'bullish') {
      return fvg.direction === 'bullish';
    } else if (bias.bias === 'bearish') {
      return fvg.direction === 'bearish';
    }
    return true;
  });

  const fvgPresent = alignedFVGs.length > 0;

  // Validate setup
  const setupValid =
    liquidityTaken &&
    priceInCorrectZone &&
    (displacementDetected || strongDisplacement) &&
    fvgPresent &&
    reactionStrength === 'strong';

  // Get latest 5 swing highs and lows
  const swingPoints = getLatestSwingPoints(recentData, 5);

  return {
    liquidity_taken: liquidityTaken,
    liquidity_type: liquidityType,
    reaction_strength: reactionStrength,
    fvg_present: fvgPresent,
    setup_valid: setupValid,
    displacement_detected: displacementDetected,
    liquidity_sweeps: liquiditySweeps,
    fvgs: alignedFVGs,
    displacement,
    swing_highs: swingPoints.highs,
    swing_lows: swingPoints.lows,
  };
}

/**
 * Check reaction strength after liquidity sweep
 */
function checkReactionStrength(
  sweep: { price: number; time: number; type: 'buy-side' | 'sell-side' },
  data: TimeframeData[],
  bias: BiasAnalysis
): ReactionStrength {
  const sweepIndex = data.findIndex((d) => d.time === sweep.time);
  if (sweepIndex === -1 || sweepIndex + 3 >= data.length) {
    return 'weak';
  }

  // Look at next 3-5 candles after sweep
  const reactionCandles = data.slice(sweepIndex + 1, sweepIndex + 6);
  if (reactionCandles.length === 0) return 'weak';

  if (sweep.type === 'buy-side') {
    // After buy-side sweep, expect bullish reaction
    const avgClose = reactionCandles.reduce((sum, c) => sum + c.close, 0) / reactionCandles.length;
    const sweepPrice = sweep.price;
    const movePercent = ((avgClose - sweepPrice) / sweepPrice) * 100;

    // Strong reaction: moves 0.5%+ in correct direction
    if (movePercent > 0.5 && bias.bias === 'bullish') {
      return 'strong';
    }
  } else {
    // After sell-side sweep, expect bearish reaction
    const avgClose = reactionCandles.reduce((sum, c) => sum + c.close, 0) / reactionCandles.length;
    const sweepPrice = sweep.price;
    const movePercent = ((sweepPrice - avgClose) / sweepPrice) * 100;

    // Strong reaction: moves 0.5%+ in correct direction
    if (movePercent > 0.5 && bias.bias === 'bearish') {
      return 'strong';
    }
  }

  return 'weak';
}

