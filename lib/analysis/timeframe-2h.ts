// 2H Timeframe Analysis - Bias Engine

import {
  TimeframeData,
  BiasAnalysis,
  Bias,
  PremiumDiscount,
} from '@/types/analysis';
import { detectFVGs } from '@/lib/ict/fvg';
import { detectMSS } from '@/lib/ict/mss';
import { findLiquidityPools, detectEqualHighs, detectEqualLows } from '@/lib/ict/liquidity';
import {
  calculateRange,
  calculatePDLevel,
  getPremiumDiscount,
} from '@/lib/ict/premium-discount';
import { getLatestSwingPoints } from '@/lib/ict/support-resistance';

/**
 * Analyze 2H timeframe to determine bias
 * This is the directional intent engine
 */
export function analyze2HBias(data: TimeframeData[]): BiasAnalysis {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/timeframe-2h.ts:22',message:'analyze2HBias called',data:{dataLength:data.length,firstItem:data[0]||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  if (data.length === 0) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/analysis/timeframe-2h.ts:25',message:'No data error thrown',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    throw new Error('No data provided for 2H analysis');
  }

  // Enforce 48h window (last 2 days = 24 candles on 2H)
  const maxCandles = 24;
  const recentData = data.slice(-maxCandles);

  // Calculate range (highest high, lowest low)
  const range = calculateRange(recentData);
  const rangeHigh = range.high;
  const rangeLow = range.low;

  // Calculate Premium/Discount level (50%)
  const pdLevel = calculatePDLevel(rangeHigh, rangeLow);

  // Get current price (last candle close)
  const currentPrice = recentData[recentData.length - 1].close;

  // Determine premium/discount
  const premiumDiscount = getPremiumDiscount(
    currentPrice,
    rangeHigh,
    rangeLow
  );

  // Determine bias based on price location and recent structure
  const bias = determineBias(recentData, currentPrice, pdLevel);

  // Detect FVGs
  const fvgs = detectFVGs(recentData, '2h');

  // Detect Market Structure Shifts
  const mssPoints = detectMSS(recentData, '2h');

  // Find liquidity pools
  const liquidityPools = findLiquidityPools(recentData, '2h');
  const equalHighs = detectEqualHighs(recentData);
  const equalLows = detectEqualLows(recentData);

  // Identify order blocks (simplified: strong candles at extremes)
  const orderBlocks = identifyOrderBlocks(recentData);

  // Determine HTF zone description
  const htfZone = determineHTFZone(
    recentData,
    fvgs,
    orderBlocks,
    rangeHigh,
    rangeLow
  );

  // Get latest 5 swing highs and lows
  const swingPoints = getLatestSwingPoints(recentData, 5);

  return {
    bias,
    range_high: rangeHigh,
    range_low: rangeLow,
    premium_discount: premiumDiscount,
    key_liquidity: {
      buy_side: equalLows,
      sell_side: equalHighs,
    },
    htf_zone: htfZone,
    fvgs,
    order_blocks: orderBlocks,
    liquidity_pools: liquidityPools,
    pd_level: pdLevel,
    swing_highs: swingPoints.highs,
    swing_lows: swingPoints.lows,
  };
}

/**
 * Determine bias based on price action
 */
function determineBias(
  data: TimeframeData[],
  currentPrice: number,
  pdLevel: number
): Bias {
  if (data.length < 3) return 'neutral';

  // Get recent price action
  const recentCandles = data.slice(-5);
  const closes = recentCandles.map((c) => c.close);
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);

  // Check for higher highs and higher lows (bullish)
  let higherHighs = 0;
  let higherLows = 0;
  for (let i = 1; i < recentCandles.length; i++) {
    if (highs[i] > highs[i - 1]) higherHighs++;
    if (lows[i] > lows[i - 1]) higherLows++;
  }

  // Check for lower highs and lower lows (bearish)
  let lowerHighs = 0;
  let lowerLows = 0;
  for (let i = 1; i < recentCandles.length; i++) {
    if (highs[i] < highs[i - 1]) lowerHighs++;
    if (lows[i] < lows[i - 1]) lowerLows++;
  }

  // Price location factor
  const inPremium = currentPrice >= pdLevel;

  // Determine bias
  if (higherHighs >= 2 && higherLows >= 2) {
    return 'bullish';
  } else if (lowerHighs >= 2 && lowerLows >= 2) {
    return 'bearish';
  } else if (inPremium && higherHighs >= 1) {
    return 'bullish';
  } else if (!inPremium && lowerLows >= 1) {
    return 'bearish';
  }

  return 'neutral';
}

/**
 * Identify order blocks (strong candles at range extremes)
 */
function identifyOrderBlocks(data: TimeframeData[]) {
  const orderBlocks: Array<{
    startTime: number;
    endTime: number;
    top: number;
    bottom: number;
    direction: 'bullish' | 'bearish';
    timeframe: '2h';
    strength?: 'weak' | 'medium' | 'strong';
  }> = [];

  if (data.length < 2) return orderBlocks;

  const range = calculateRange(data);
  const avgCandleSize =
    data.reduce((sum, d) => sum + (d.high - d.low), 0) / data.length;

  // Look for strong candles near range extremes
  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const candleSize = candle.high - candle.low;
    const bodySize = Math.abs(candle.close - candle.open);

    // Bullish order block: strong green candle near range low
    if (
      candle.close > candle.open &&
      candle.low <= range.low * 1.01 && // Within 1% of range low
      bodySize > avgCandleSize * 0.7
    ) {
      orderBlocks.push({
        startTime: candle.time,
        endTime: candle.time,
        top: candle.high,
        bottom: candle.low,
        direction: 'bullish',
        timeframe: '2h',
        strength: candleSize > avgCandleSize * 1.5 ? 'strong' : 'medium',
      });
    }

    // Bearish order block: strong red candle near range high
    if (
      candle.close < candle.open &&
      candle.high >= range.high * 0.99 && // Within 1% of range high
      bodySize > avgCandleSize * 0.7
    ) {
      orderBlocks.push({
        startTime: candle.time,
        endTime: candle.time,
        top: candle.high,
        bottom: candle.low,
        direction: 'bearish',
        timeframe: '2h',
        strength: candleSize > avgCandleSize * 1.5 ? 'strong' : 'medium',
      });
    }
  }

  return orderBlocks;
}

/**
 * Determine HTF zone description
 */
function determineHTFZone(
  data: TimeframeData[],
  fvgs: any[],
  orderBlocks: any[],
  rangeHigh: number,
  rangeLow: number
): string {
  const currentPrice = data[data.length - 1].close;
  const pdLevel = calculatePDLevel(rangeHigh, rangeLow);

  if (fvgs.length > 0) {
    const latestFVG = fvgs[fvgs.length - 1];
    if (
      currentPrice >= latestFVG.bottom &&
      currentPrice <= latestFVG.top
    ) {
      return `2H FVG (${latestFVG.direction})`;
    }
  }

  if (orderBlocks.length > 0) {
    const latestOB = orderBlocks[orderBlocks.length - 1];
    if (
      currentPrice >= latestOB.bottom &&
      currentPrice <= latestOB.top
    ) {
      return `2H Order Block (${latestOB.direction})`;
    }
  }

  if (currentPrice >= pdLevel) {
    return '2H Premium Zone';
  } else {
    return '2H Discount Zone';
  }
}

