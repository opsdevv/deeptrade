// Liquidity Sweep Detection

import { TimeframeData, LiquidityPool, Timeframe } from '@/types/analysis';

/**
 * Detect equal highs (liquidity pools)
 */
export function detectEqualHighs(
  data: TimeframeData[],
  tolerance: number = 0.001 // 0.1% tolerance
): number[] {
  const highs: number[] = [];
  const equalHighs: number[] = [];

  // Extract all highs
  data.forEach((candle) => {
    highs.push(candle.high);
  });

  // Group similar highs
  const grouped: { [key: string]: number[] } = {};

  highs.forEach((high) => {
    let found = false;
    for (const key in grouped) {
      const avgHigh = parseFloat(key);
      if (Math.abs(high - avgHigh) / avgHigh <= tolerance) {
        grouped[key].push(high);
        found = true;
        break;
      }
    }
    if (!found) {
      grouped[high.toString()] = [high];
    }
  });

  // Find groups with 2+ occurrences (equal highs)
  for (const key in grouped) {
    if (grouped[key].length >= 2) {
      const avg = grouped[key].reduce((a, b) => a + b, 0) / grouped[key].length;
      equalHighs.push(avg);
    }
  }

  return equalHighs;
}

/**
 * Detect equal lows (liquidity pools)
 */
export function detectEqualLows(
  data: TimeframeData[],
  tolerance: number = 0.001
): number[] {
  const lows: number[] = [];
  const equalLows: number[] = [];

  data.forEach((candle) => {
    lows.push(candle.low);
  });

  const grouped: { [key: string]: number[] } = {};

  lows.forEach((low) => {
    let found = false;
    for (const key in grouped) {
      const avgLow = parseFloat(key);
      if (Math.abs(low - avgLow) / avgLow <= tolerance) {
        grouped[key].push(low);
        found = true;
        break;
      }
    }
    if (!found) {
      grouped[low.toString()] = [low];
    }
  });

  for (const key in grouped) {
    if (grouped[key].length >= 2) {
      const avg = grouped[key].reduce((a, b) => a + b, 0) / grouped[key].length;
      equalLows.push(avg);
    }
  }

  return equalLows;
}

/**
 * Check if liquidity has been swept (price broke through and came back)
 */
export function isLiquiditySwept(
  liquidityPrice: number,
  data: TimeframeData[],
  type: 'buy-side' | 'sell-side'
): boolean {
  if (data.length < 2) return false;

  let swept = false;
  let returned = false;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];

    if (type === 'buy-side') {
      // Buy-side liquidity: price breaks below, then returns above
      if (!swept && candle.low < liquidityPrice) {
        swept = true;
      }
      if (swept && candle.high > liquidityPrice) {
        returned = true;
      }
    } else {
      // Sell-side liquidity: price breaks above, then returns below
      if (!swept && candle.high > liquidityPrice) {
        swept = true;
      }
      if (swept && candle.low < liquidityPrice) {
        returned = true;
      }
    }

    if (swept && returned) {
      return true;
    }
  }

  return false;
}

/**
 * Find liquidity pools from data
 */
export function findLiquidityPools(
  data: TimeframeData[],
  timeframe: Timeframe
): LiquidityPool[] {
  const pools: LiquidityPool[] = [];

  const equalHighs = detectEqualHighs(data);
  const equalLows = detectEqualLows(data);

  equalHighs.forEach((price) => {
    const latestCandle = data[data.length - 1];
    pools.push({
      price,
      type: 'sell-side',
      timeframe,
      timestamp: latestCandle.time,
      description: 'Equal High',
    });
  });

  equalLows.forEach((price) => {
    const latestCandle = data[data.length - 1];
    pools.push({
      price,
      type: 'buy-side',
      timeframe,
      timestamp: latestCandle.time,
      description: 'Equal Low',
    });
  });

  return pools;
}

/**
 * Get Asian range (first 4 hours of trading day)
 */
export function getAsianRange(data: TimeframeData[]): {
  high: number;
  low: number;
  time: number;
} | null {
  if (data.length === 0) return null;

  // For simplicity, take first 4 candles (adjust based on timeframe)
  const asianData = data.slice(0, Math.min(4, data.length));

  if (asianData.length === 0) return null;

  const high = Math.max(...asianData.map((d) => d.high));
  const low = Math.min(...asianData.map((d) => d.low));

  return {
    high,
    low,
    time: asianData[0].time,
  };
}

