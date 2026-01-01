// 5m Timeframe Analysis - Execution Signals

import {
  TimeframeData,
  ExecutionSignal,
  BiasAnalysis,
  LiquidityAnalysis,
  Direction,
  Confidence,
} from '@/types/analysis';
import { detectFVGs, getFVGMidpoint, isPriceInFVG } from '@/lib/ict/fvg';
import { detectMSS, isMSSConfirmed, getLatestMSS } from '@/lib/ict/mss';
import { detectDisplacement, isStrongDisplacement } from '@/lib/ict/displacement';
import { isLiquiditySwept } from '@/lib/ict/liquidity';
import { formatPrice } from '@/lib/utils/price-format';

/**
 * Analyze 5m timeframe for execution signals
 */
export function analyze5mExecution(
  data: TimeframeData[],
  bias: BiasAnalysis,
  liquidity: LiquidityAnalysis,
  instrument: string = 'GBPUSD'
): ExecutionSignal {
  if (data.length === 0) {
    throw new Error('No data provided for 5m analysis');
  }

  // Enforce 48h window (last 2 days = 576 candles on 5m)
  const maxCandles = 576;
  const recentData = data.slice(-maxCandles);

  const currentPrice = recentData[recentData.length - 1].close;

  // Confirm liquidity sweep on 5m (if not already confirmed on 15m)
  const liquidityConfirmed = confirmLiquiditySweep(recentData, liquidity);

  // Detect displacement
  const displacement = detectDisplacement(recentData, '5m');
  const strongDisplacement = displacement.some((d) => isStrongDisplacement(d));

  // Detect MSS
  const mssPoints = detectMSS(recentData, '5m');
  const latestMSS = getLatestMSS(mssPoints);
  const mssConfirmed = latestMSS
    ? isMSSConfirmed(latestMSS, recentData)
    : false;

  // Find FVGs
  const fvgs = detectFVGs(recentData, '5m');
  const alignedFVGs = fvgs.filter((fvg) => {
    if (bias.bias === 'bullish') {
      return fvg.direction === 'bullish';
    } else if (bias.bias === 'bearish') {
      return fvg.direction === 'bearish';
    }
    return true;
  });

  // Get the most recent unfilled FVG
  const unfilledFVGs = alignedFVGs.filter((fvg) => {
    // Check if FVG is still valid (not filled)
    const fvgData = recentData.filter(
      (d) => d.time >= fvg.startTime && d.time <= fvg.endTime
    );
    if (fvg.direction === 'bullish') {
      return !fvgData.some((d) => d.low < fvg.bottom);
    } else {
      return !fvgData.some((d) => d.high > fvg.top);
    }
  });

  const fvgDetails = unfilledFVGs.length > 0 ? unfilledFVGs[unfilledFVGs.length - 1] : null;

  // Validate all conditions
  const allConditionsMet =
    liquidityConfirmed &&
    strongDisplacement &&
    mssConfirmed &&
    fvgDetails !== null &&
    liquidity.setup_valid;

  if (!allConditionsMet) {
    return {
      trade_signal: false,
      direction: null,
      entry_zone: '',
      stop_level: '',
      target_zone: '',
      confidence: 'low',
      mss_confirmed: mssConfirmed,
      fvg_details: fvgDetails,
      entry_price: null,
      stop_price: null,
      target_price: null,
      risk_reward_ratio: null,
    };
  }

  // Determine direction based on bias
  const direction: Direction = bias.bias === 'bullish' ? 'long' : bias.bias === 'bearish' ? 'short' : null;

  if (!direction || !fvgDetails) {
    return {
      trade_signal: false,
      direction: null,
      entry_zone: '',
      stop_level: '',
      target_zone: '',
      confidence: 'low',
      mss_confirmed: mssConfirmed,
      fvg_details: fvgDetails,
      entry_price: null,
      stop_price: null,
      target_price: null,
      risk_reward_ratio: null,
    };
  }

  // Calculate entry (50% of FVG)
  const entryPrice = getFVGMidpoint(fvgDetails);
  const entryZone = formatPrice(entryPrice, instrument);

  // Calculate stop (beyond liquidity sweep or FVG boundary)
  const stopPrice = calculateStopLevel(
    direction,
    fvgDetails,
    recentData,
    liquidity
  );
  const stopLevel = formatPrice(stopPrice, instrument);

  // Calculate target (opposing liquidity or fixed %)
  const targetPrice = calculateTargetLevel(
    direction,
    entryPrice,
    stopPrice,
    bias,
    recentData
  );
  const targetZone = formatPrice(targetPrice, instrument);

  // Calculate risk/reward ratio
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  const riskRewardRatio = risk > 0 ? reward / risk : null;

  // Determine confidence
  const confidence = determineConfidence(
    mssConfirmed,
    strongDisplacement,
    liquidityConfirmed,
    riskRewardRatio
  );

  return {
    trade_signal: true,
    direction,
    entry_zone: entryZone,
    stop_level: stopLevel,
    target_zone: targetZone,
    confidence,
    mss_confirmed: mssConfirmed,
    fvg_details: fvgDetails,
    entry_price: entryPrice,
    stop_price: stopPrice,
    target_price: targetPrice,
    risk_reward_ratio: riskRewardRatio,
  };
}

/**
 * Confirm liquidity sweep on 5m timeframe
 */
function confirmLiquiditySweep(
  data: TimeframeData[],
  liquidity: LiquidityAnalysis
): boolean {
  if (!liquidity.liquidity_taken || !liquidity.liquidity_sweeps.length) {
    return false;
  }

  // Check if 5m data shows the same liquidity sweep
  const latestSweep = liquidity.liquidity_sweeps.reduce((latest, current) =>
    current.time > latest.time ? current : latest
  );

  // Find if this sweep exists in 5m data
  const sweepExists = data.some((candle) => {
    if (latestSweep.type === 'buy-side') {
      return candle.low < latestSweep.price && candle.high > latestSweep.price;
    } else {
      return candle.high > latestSweep.price && candle.low < latestSweep.price;
    }
  });

  return sweepExists;
}

/**
 * Calculate stop loss level
 */
function calculateStopLevel(
  direction: Direction,
  fvg: any,
  data: TimeframeData[],
  liquidity: LiquidityAnalysis
): number {
  if (direction === 'long') {
    // Stop below FVG bottom or liquidity sweep
    const fvgStop = fvg.bottom * 0.999; // 0.1% below FVG bottom

    // Check for buy-side liquidity
    if (liquidity.liquidity_sweeps.length > 0) {
      const buySideSweeps = liquidity.liquidity_sweeps.filter(
        (s) => s.type === 'buy-side'
      );
      if (buySideSweeps.length > 0) {
        const lowestSweep = Math.min(...buySideSweeps.map((s) => s.price));
        return Math.min(fvgStop, lowestSweep * 0.999);
      }
    }

    return fvgStop;
  } else {
    // Stop above FVG top or liquidity sweep
    const fvgStop = fvg.top * 1.001; // 0.1% above FVG top

    // Check for sell-side liquidity
    if (liquidity.liquidity_sweeps.length > 0) {
      const sellSideSweeps = liquidity.liquidity_sweeps.filter(
        (s) => s.type === 'sell-side'
      );
      if (sellSideSweeps.length > 0) {
        const highestSweep = Math.max(...sellSideSweeps.map((s) => s.price));
        return Math.max(fvgStop, highestSweep * 1.001);
      }
    }

    return fvgStop;
  }
}

/**
 * Calculate target level
 */
function calculateTargetLevel(
  direction: Direction,
  entryPrice: number,
  stopPrice: number,
  bias: BiasAnalysis,
  data: TimeframeData[]
): number {
  // Option 1: Fixed 1% move
  const fixedTarget = direction === 'long'
    ? entryPrice * 1.01
    : entryPrice * 0.99;

  // Option 2: Opposing liquidity
  let opposingLiquidity: number | null = null;
  if (direction === 'long') {
    // Target sell-side liquidity (equal highs)
    if (bias.key_liquidity.sell_side.length > 0) {
      opposingLiquidity = Math.max(...bias.key_liquidity.sell_side);
    }
  } else {
    // Target buy-side liquidity (equal lows)
    if (bias.key_liquidity.buy_side.length > 0) {
      opposingLiquidity = Math.min(...bias.key_liquidity.buy_side);
    }
  }

  // Use opposing liquidity if available and reasonable, otherwise use fixed target
  if (opposingLiquidity) {
    const risk = Math.abs(entryPrice - stopPrice);
    const rewardToLiquidity = Math.abs(opposingLiquidity - entryPrice);
    // Only use if R:R is at least 1:1
    if (rewardToLiquidity >= risk) {
      return opposingLiquidity;
    }
  }

  return fixedTarget;
}

/**
 * Determine confidence level
 */
function determineConfidence(
  mssConfirmed: boolean,
  strongDisplacement: boolean,
  liquidityConfirmed: boolean,
  riskRewardRatio: number | null
): Confidence {
  let score = 0;

  if (mssConfirmed) score += 1;
  if (strongDisplacement) score += 1;
  if (liquidityConfirmed) score += 1;
  if (riskRewardRatio && riskRewardRatio >= 2) score += 1;

  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

