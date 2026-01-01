// Fair Value Gap (FVG) Detection

import { TimeframeData, FVG, Timeframe } from '@/types/analysis';

/**
 * Detect Fair Value Gaps in price data
 * FVG occurs when there's a gap between candles (no overlap)
 */
export function detectFVGs(
  data: TimeframeData[],
  timeframe: Timeframe
): FVG[] {
  const fvgs: FVG[] = [];

  for (let i = 0; i < data.length - 2; i++) {
    const candle1 = data[i];
    const candle2 = data[i + 1];
    const candle3 = data[i + 2];

    // Bullish FVG: Candle 1 high < Candle 3 low
    if (candle1.high < candle3.low) {
      fvgs.push({
        startTime: candle1.time,
        endTime: candle3.time,
        top: candle3.low,
        bottom: candle1.high,
        direction: 'bullish',
        timeframe,
      });
    }

    // Bearish FVG: Candle 1 low > Candle 3 high
    if (candle1.low > candle3.high) {
      fvgs.push({
        startTime: candle1.time,
        endTime: candle3.time,
        top: candle1.low,
        bottom: candle3.high,
        direction: 'bearish',
        timeframe,
      });
    }
  }

  return fvgs;
}

/**
 * Check if price is inside a FVG
 */
export function isPriceInFVG(price: number, fvg: FVG): boolean {
  return price >= fvg.bottom && price <= fvg.top;
}

/**
 * Find FVGs that haven't been filled
 */
export function getUnfilledFVGs(
  fvgs: FVG[],
  currentPrice: number,
  data: TimeframeData[]
): FVG[] {
  return fvgs.filter((fvg) => {
    if (isPriceInFVG(currentPrice, fvg)) {
      return false; // FVG is being filled
    }

    // Check if price has touched the FVG zone
    const relevantData = data.filter(
      (d) => d.time >= fvg.startTime && d.time <= fvg.endTime
    );

    if (fvg.direction === 'bullish') {
      // Bullish FVG is filled if price goes below bottom
      return !relevantData.some((d) => d.low < fvg.bottom);
    } else {
      // Bearish FVG is filled if price goes above top
      return !relevantData.some((d) => d.high > fvg.top);
    }
  });
}

/**
 * Calculate 50% retracement level of FVG (entry zone)
 */
export function getFVGMidpoint(fvg: FVG): number {
  return (fvg.top + fvg.bottom) / 2;
}

