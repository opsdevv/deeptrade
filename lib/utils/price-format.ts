// Price Formatting Utilities

/**
 * Get decimal places for instrument
 */
export function getPriceDecimals(instrument: string): number {
  const upperSymbol = instrument.toUpperCase();
  
  // Precious metals - 2 decimal places
  if (upperSymbol.includes('XAU') || upperSymbol.includes('GOLD') ||
      upperSymbol.includes('XAG') || upperSymbol.includes('SILVER') ||
      upperSymbol.includes('XPD') || upperSymbol.includes('XPT')) {
    return 2;
  }
  
  // JPY pairs - 3 decimal places
  if (upperSymbol.includes('JPY')) {
    return 3;
  }
  
  // Volatility/Synthetic indices - 2 decimal places
  if (upperSymbol.includes('VOLATILITY') || upperSymbol.includes('V50') || 
      upperSymbol.includes('V75') || upperSymbol.includes('V100') ||
      upperSymbol.includes('V150') || upperSymbol.includes('V200') ||
      upperSymbol.includes('V250') || upperSymbol.startsWith('R_') ||
      upperSymbol.includes('1HZ') || upperSymbol.includes('US_OTC')) {
    return 2;
  }
  
  // Forex pairs - 5 decimal places (except JPY which is 3)
  if (upperSymbol.includes('USD') || upperSymbol.includes('EUR') || 
      upperSymbol.includes('GBP') || upperSymbol.includes('AUD') ||
      upperSymbol.includes('NZD') || upperSymbol.includes('CAD') ||
      upperSymbol.includes('CHF')) {
    return 5;
  }
  
  // Stock indices - typically 2 decimal places
  if (upperSymbol.includes('INDEX') || upperSymbol.includes('STOCK')) {
    return 2;
  }
  
  // Default: 5 decimal places
  return 5;
}

/**
 * Format price with proper decimal places and thousands separators
 */
export function formatPrice(price: number | null | undefined, instrument: string): string {
  if (price === null || price === undefined) {
    return 'N/A';
  }
  
  const decimals = getPriceDecimals(instrument);
  const fixedPrice = price.toFixed(decimals);
  
  // Add thousands separators (commas)
  const parts = fixedPrice.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return parts.join('.');
}

/**
 * Format price range
 */
export function formatPriceRange(
  low: number,
  high: number,
  instrument: string
): string {
  return `${formatPrice(low, instrument)} - ${formatPrice(high, instrument)}`;
}

/**
 * Format price array
 */
export function formatPriceArray(
  prices: number[],
  instrument: string
): string {
  if (prices.length === 0) return 'None';
  return prices.map((p) => formatPrice(p, instrument)).join(', ');
}

/**
 * Format timestamp with timezone information
 * Defaults to Johannesburg timezone (UTC+2)
 */
export function formatTimeWithTimezone(
  timestamp: number | string | Date,
  timezone: string = 'Africa/Johannesburg'
): string {
  const date = typeof timestamp === 'number' 
    ? new Date(timestamp * 1000) 
    : typeof timestamp === 'string'
    ? new Date(timestamp)
    : timestamp;
  
  const formattedDate = date.toLocaleString('en-US', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const timezoneAbbr = date.toLocaleTimeString('en-US', { 
    timeZone: timezone,
    timeZoneName: 'short' 
  }).split(' ').pop() || '';
  
  return `${formattedDate} (${timezoneAbbr})`;
}

/**
 * Format time with timezone (time only)
 * Defaults to Johannesburg timezone (UTC+2)
 */
export function formatTimeOnlyWithTimezone(
  timestamp: number | string | Date,
  timezone: string = 'Africa/Johannesburg'
): string {
  const date = typeof timestamp === 'number' 
    ? new Date(timestamp * 1000) 
    : typeof timestamp === 'string'
    ? new Date(timestamp)
    : timestamp;
  
  const formattedTime = date.toLocaleTimeString('en-US', { 
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const timezoneAbbr = date.toLocaleTimeString('en-US', { 
    timeZone: timezone,
    timeZoneName: 'short' 
  }).split(' ').pop() || '';
  
  return `${formattedTime} (${timezoneAbbr})`;
}

