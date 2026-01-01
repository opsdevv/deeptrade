// Displacement Detection

import { TimeframeData, DisplacementData, Timeframe } from '@/types/analysis';

/**
 * Detect displacement (strong momentum candles)
 * Displacement is characterized by large candles with minimal wicks
 */
export function detectDisplacement(
  data: TimeframeData[],
  timeframe: Timeframe
): DisplacementData[] {
  const displacements: DisplacementData[] = [];

  if (data.length < 2) return displacements;

  // Calculate average candle size for comparison
  const avgCandleSize =
    data.reduce((sum, d) => sum + (d.high - d.low), 0) / data.length;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const candleSize = candle.high - candle.low;
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    // Displacement criteria:
    // 1. Candle size > 1.5x average
    // 2. Body > 70% of candle size (minimal wicks)
    // 3. Strong directional move
    const bodyRatio = bodySize / candleSize;
    const isLargeCandle = candleSize > avgCandleSize * 1.5;
    const hasMinimalWicks = bodyRatio > 0.7;
    const isStrongMove = bodySize > avgCandleSize * 1.2;

    if (isLargeCandle && hasMinimalWicks && isStrongMove) {
      const direction = candle.close > candle.open ? 'bullish' : 'bearish';
      const strength = Math.min(1, candleSize / (avgCandleSize * 2));

      displacements.push({
        time: candle.time,
        strength,
        direction,
        candleIndex: i,
        timeframe,
      });
    }
  }

  return displacements;
}

/**
 * Calculate displacement strength (0-1 scale)
 */
export function calculateDisplacementStrength(
  candle: TimeframeData,
  avgCandleSize: number
): number {
  const candleSize = candle.high - candle.low;
  const bodySize = Math.abs(candle.close - candle.open);
  const bodyRatio = bodySize / candleSize;

  // Normalize strength based on size and body ratio
  const sizeFactor = Math.min(1, candleSize / (avgCandleSize * 2));
  const bodyFactor = bodyRatio;

  return (sizeFactor + bodyFactor) / 2;
}

/**
 * Check if displacement is strong enough (> 0.6 strength)
 */
export function isStrongDisplacement(displacement: DisplacementData): boolean {
  return displacement.strength > 0.6;
}

/**
 * Get the most recent displacement
 */
export function getLatestDisplacement(
  displacements: DisplacementData[]
): DisplacementData | null {
  if (displacements.length === 0) return null;
  return displacements.reduce((latest, current) =>
    current.time > latest.time ? current : latest
  );
}

