// Premium/Discount (PD) Array Calculations

import { PremiumDiscount } from '@/types/analysis';

/**
 * Calculate Premium/Discount level (50% of range)
 */
export function calculatePDLevel(rangeHigh: number, rangeLow: number): number {
  return (rangeHigh + rangeLow) / 2;
}

/**
 * Determine if price is in premium or discount
 */
export function getPremiumDiscount(
  price: number,
  rangeHigh: number,
  rangeLow: number
): PremiumDiscount {
  const pdLevel = calculatePDLevel(rangeHigh, rangeLow);
  return price >= pdLevel ? 'premium' : 'discount';
}

/**
 * Calculate range high and low from data
 */
export function calculateRange(data: { high: number; low: number }[]): {
  high: number;
  low: number;
} {
  if (data.length === 0) {
    return { high: 0, low: 0 };
  }

  const high = Math.max(...data.map((d) => d.high));
  const low = Math.min(...data.map((d) => d.low));

  return { high, low };
}

/**
 * Get price location percentage in range (0-100)
 * 0 = range low, 100 = range high
 */
export function getPriceLocation(
  price: number,
  rangeHigh: number,
  rangeLow: number
): number {
  if (rangeHigh === rangeLow) return 50;
  return ((price - rangeLow) / (rangeHigh - rangeLow)) * 100;
}

/**
 * Check if price is in premium zone (> 50%)
 */
export function isInPremium(
  price: number,
  rangeHigh: number,
  rangeLow: number
): boolean {
  return getPremiumDiscount(price, rangeHigh, rangeLow) === 'premium';
}

/**
 * Check if price is in discount zone (< 50%)
 */
export function isInDiscount(
  price: number,
  rangeHigh: number,
  rangeLow: number
): boolean {
  return getPremiumDiscount(price, rangeHigh, rangeLow) === 'discount';
}

