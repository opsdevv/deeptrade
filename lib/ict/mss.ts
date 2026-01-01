// Market Structure Shift (MSS) Detection

import { TimeframeData, MSS, Timeframe } from '@/types/analysis';

/**
 * Detect Market Structure Shifts
 * MSS occurs when price breaks previous structure (higher high/lower low)
 */
export function detectMSS(
  data: TimeframeData[],
  timeframe: Timeframe
): MSS[] {
  const mssPoints: MSS[] = [];

  if (data.length < 3) return mssPoints;

  // Track swing highs and lows
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const swingHighTimes: number[] = [];
  const swingLowTimes: number[] = [];

  // Identify swing points (simplified: local highs/lows)
  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const next = data[i + 1];

    // Swing high
    if (curr.high > prev.high && curr.high > next.high) {
      swingHighs.push(curr.high);
      swingHighTimes.push(curr.time);
    }

    // Swing low
    if (curr.low < prev.low && curr.low < next.low) {
      swingLows.push(curr.low);
      swingLowTimes.push(curr.time);
    }
  }

  // Detect bullish MSS (break of previous high)
  for (let i = 1; i < swingHighs.length; i++) {
    if (swingHighs[i] > swingHighs[i - 1]) {
      mssPoints.push({
        time: swingHighTimes[i],
        direction: 'bullish',
        previousHigh: swingHighs[i - 1],
        newHigh: swingHighs[i],
        timeframe,
      });
    }
  }

  // Detect bearish MSS (break of previous low)
  for (let i = 1; i < swingLows.length; i++) {
    if (swingLows[i] < swingLows[i - 1]) {
      mssPoints.push({
        time: swingLowTimes[i],
        direction: 'bearish',
        previousLow: swingLows[i - 1],
        newLow: swingLows[i],
        timeframe,
      });
    }
  }

  return mssPoints;
}

/**
 * Check if MSS is confirmed (price holds above/below break)
 */
export function isMSSConfirmed(
  mss: MSS,
  data: TimeframeData[],
  lookbackBars: number = 3
): boolean {
  const mssIndex = data.findIndex((d) => d.time === mss.time);
  if (mssIndex === -1 || mssIndex + lookbackBars >= data.length) {
    return false;
  }

  const subsequentData = data.slice(mssIndex + 1, mssIndex + lookbackBars + 1);

  if (mss.direction === 'bullish' && mss.newHigh) {
    // Bullish MSS confirmed if price stays above previous high
    return subsequentData.every((d) => d.low > (mss.previousHigh || 0));
  } else if (mss.direction === 'bearish' && mss.newLow) {
    // Bearish MSS confirmed if price stays below previous low
    return subsequentData.every((d) => d.high < (mss.previousLow || Infinity));
  }

  return false;
}

/**
 * Get the most recent MSS
 */
export function getLatestMSS(mssPoints: MSS[]): MSS | null {
  if (mssPoints.length === 0) return null;
  return mssPoints.reduce((latest, current) =>
    current.time > latest.time ? current : latest
  );
}

