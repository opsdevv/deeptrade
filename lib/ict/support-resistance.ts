// Support and Resistance Level Detection

import { TimeframeData } from '@/types/analysis';

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // 0-1, based on touches and time
  touches: number; // Number of times price touched this level
  timeframe: '2h' | '15m' | '5m';
}

/**
 * Detect support and resistance levels from price data
 * Uses swing highs/lows and consolidation zones
 */
export function detectSupportResistance(
  data: TimeframeData[],
  timeframe: '2h' | '15m' | '5m'
): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];

  if (data.length < 5) return levels;

  // Find swing points (local highs and lows)
  const swingHighs: Array<{ price: number; time: number }> = [];
  const swingLows: Array<{ price: number; time: number }> = [];

  // Detect swing points (simplified: local extrema)
  for (let i = 2; i < data.length - 2; i++) {
    const prev2 = data[i - 2];
    const prev1 = data[i - 1];
    const curr = data[i];
    const next1 = data[i + 1];
    const next2 = data[i + 2];

    // Swing high: higher than 2 candles before and after
    if (
      curr.high > prev2.high &&
      curr.high > prev1.high &&
      curr.high > next1.high &&
      curr.high > next2.high
    ) {
      swingHighs.push({ price: curr.high, time: curr.time });
    }

    // Swing low: lower than 2 candles before and after
    if (
      curr.low < prev2.low &&
      curr.low < prev1.low &&
      curr.low < next1.low &&
      curr.low < next2.low
    ) {
      swingLows.push({ price: curr.low, time: curr.low });
    }
  }

  // Group similar price levels (within 0.5% tolerance)
  const tolerance = 0.005; // 0.5%

  // Group resistance levels (swing highs)
  const resistanceGroups: Array<{ prices: number[]; times: number[] }> = [];
  swingHighs.forEach((swing) => {
    let grouped = false;
    for (const group of resistanceGroups) {
      const avgPrice = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
      if (Math.abs(swing.price - avgPrice) / avgPrice <= tolerance) {
        group.prices.push(swing.price);
        group.times.push(swing.time);
        grouped = true;
        break;
      }
    }
    if (!grouped) {
      resistanceGroups.push({ prices: [swing.price], times: [swing.time] });
    }
  });

  // Group support levels (swing lows)
  const supportGroups: Array<{ prices: number[]; times: number[] }> = [];
  swingLows.forEach((swing) => {
    let grouped = false;
    for (const group of supportGroups) {
      const avgPrice = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
      if (Math.abs(swing.price - avgPrice) / avgPrice <= tolerance) {
        group.prices.push(swing.price);
        group.times.push(swing.time);
        grouped = true;
        break;
      }
    }
    if (!grouped) {
      supportGroups.push({ prices: [swing.price], times: [swing.time] });
    }
  });

  // Create resistance levels
  resistanceGroups.forEach((group) => {
    const avgPrice = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
    const touches = group.prices.length;
    // Strength based on number of touches and recency
    const recentTouches = group.times.filter(
      (t) => t > data[data.length - 10].time
    ).length;
    const strength = Math.min(1, (touches * 0.3 + recentTouches * 0.7) / 3);

    if (strength > 0.2) {
      // Only include levels with some strength
      levels.push({
        price: avgPrice,
        type: 'resistance',
        strength,
        touches,
        timeframe,
      });
    }
  });

  // Create support levels
  supportGroups.forEach((group) => {
    const avgPrice = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
    const touches = group.prices.length;
    const recentTouches = group.times.filter(
      (t) => t > data[data.length - 10].time
    ).length;
    const strength = Math.min(1, (touches * 0.3 + recentTouches * 0.7) / 3);

    if (strength > 0.2) {
      levels.push({
        price: avgPrice,
        type: 'support',
        strength,
        touches,
        timeframe,
      });
    }
  });

  // Sort by strength (strongest first)
  return levels.sort((a, b) => b.strength - a.strength);
}

/**
 * Get key support/resistance levels (top 5 strongest)
 */
export function getKeyLevels(
  levels: SupportResistanceLevel[]
): SupportResistanceLevel[] {
  return levels.slice(0, 5);
}

/**
 * Swing Point Interface
 */
export interface SwingPoint {
  price: number;
  time: number;
}

/**
 * Get the latest N swing highs and lows from price data
 * Returns the most recent swing points (not grouped)
 */
export function getLatestSwingPoints(
  data: TimeframeData[],
  count: number = 5
): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  if (data.length < 5) {
    return { highs: [], lows: [] };
  }

  // Detect swing points (local extrema)
  for (let i = 2; i < data.length - 2; i++) {
    const prev2 = data[i - 2];
    const prev1 = data[i - 1];
    const curr = data[i];
    const next1 = data[i + 1];
    const next2 = data[i + 2];

    // Swing high: higher than 2 candles before and after
    if (
      curr.high > prev2.high &&
      curr.high > prev1.high &&
      curr.high > next1.high &&
      curr.high > next2.high
    ) {
      swingHighs.push({ price: curr.high, time: curr.time });
    }

    // Swing low: lower than 2 candles before and after
    if (
      curr.low < prev2.low &&
      curr.low < prev1.low &&
      curr.low < next1.low &&
      curr.low < next2.low
    ) {
      swingLows.push({ price: curr.low, time: curr.time });
    }
  }

  // Sort by time (most recent first) and take latest N
  swingHighs.sort((a, b) => b.time - a.time);
  swingLows.sort((a, b) => b.time - a.time);

  return {
    highs: swingHighs.slice(0, count),
    lows: swingLows.slice(0, count),
  };
}
