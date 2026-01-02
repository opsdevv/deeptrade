import { DerivInstrument } from '@/lib/api/deriv';

/**
 * Detect and map symbols from text message
 * Matches both symbols (R_75) and display names (Volatility 75 Index)
 */
export function detectSymbolFromText(
  text: string,
  instruments: DerivInstrument[]
): { symbol: string; displayName: string; confidence: 'exact' | 'partial' | 'low' } | null {
  if (!text || !instruments || instruments.length === 0) {
    return null;
  }

  const normalizedText = text.toLowerCase().trim();
  
  // First, try exact symbol match (case-insensitive)
  for (const inst of instruments) {
    const symbolLower = inst.symbol.toLowerCase();
    // Check if the symbol appears as a whole word or with common separators
    const symbolPattern = new RegExp(`\\b${symbolLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (symbolPattern.test(normalizedText)) {
      return {
        symbol: inst.symbol,
        displayName: inst.display_name,
        confidence: 'exact',
      };
    }
  }

  // Second, try exact display name match (case-insensitive)
  for (const inst of instruments) {
    const displayNameLower = inst.display_name.toLowerCase();
    // Check if the full display name appears
    if (normalizedText.includes(displayNameLower)) {
      return {
        symbol: inst.symbol,
        displayName: inst.display_name,
        confidence: 'exact',
      };
    }
  }

  // Third, try partial display name match (e.g., "Volatility 75" matches "Volatility 75 Index")
  for (const inst of instruments) {
    const displayNameLower = inst.display_name.toLowerCase();
    const displayNameWords = displayNameLower.split(/\s+/).filter(w => w.length > 2); // Filter out short words
    
    // Special handling for volatility indices - look for "volatility" + number pattern
    if (inst.symbol.startsWith('R_')) {
      // Extract number from symbol (e.g., R_75 -> 75)
      const symbolNumber = inst.symbol.match(/\d+/)?.[0];
      if (symbolNumber) {
        // Check for patterns like "volatility 75", "vol 75", "v75", etc.
        const volatilityPatterns = [
          new RegExp(`volatility\\s*${symbolNumber}\\b`, 'i'),
          new RegExp(`vol\\s*${symbolNumber}\\b`, 'i'),
          new RegExp(`\\bv${symbolNumber}\\b`, 'i'),
          new RegExp(`\\br_${symbolNumber}\\b`, 'i'),
        ];
        
        if (volatilityPatterns.some(pattern => pattern.test(normalizedText))) {
          return {
            symbol: inst.symbol,
            displayName: inst.display_name,
            confidence: 'partial',
          };
        }
      }
    }
    
    // Check if significant words from display name appear in text
    const matchingWords = displayNameWords.filter(word => 
      normalizedText.includes(word)
    );
    
    // If most significant words match, consider it a match
    if (matchingWords.length >= Math.min(2, displayNameWords.length)) {
      // For other cases, if we have good word matches, return it
      return {
        symbol: inst.symbol,
        displayName: inst.display_name,
        confidence: 'partial',
      };
    }
  }

  // Fourth, try common aliases and variations
  const aliasMap: Record<string, string> = {
    'volatility 75': 'R_75',
    'vol 75': 'R_75',
    'v75': 'R_75',
    'volatility 50': 'R_50',
    'vol 50': 'R_50',
    'v50': 'R_50',
    'volatility 100': 'R_100',
    'vol 100': 'R_100',
    'v100': 'R_100',
    'volatility 25': 'R_25',
    'vol 25': 'R_25',
    'v25': 'R_25',
    'volatility 10': 'R_10',
    'vol 10': 'R_10',
    'v10': 'R_10',
    'gold': 'EURUSD', // Common but might need adjustment
    'xauusd': 'EURUSD',
  };

  for (const [alias, symbol] of Object.entries(aliasMap)) {
    if (normalizedText.includes(alias)) {
      const matchedInst = instruments.find(inst => inst.symbol === symbol);
      if (matchedInst) {
        return {
          symbol: matchedInst.symbol,
          displayName: matchedInst.display_name,
          confidence: 'low',
        };
      }
    }
  }

  return null;
}

/**
 * Get all available instruments for symbol detection
 * This is a helper that can be used in API routes
 */
export async function getInstrumentsForDetection(): Promise<DerivInstrument[]> {
  try {
    // Try to fetch from API if available (server-side)
    if (typeof window === 'undefined') {
      const { getAvailableInstruments } = await import('@/lib/api/deriv');
      return await getAvailableInstruments();
    }
  } catch (error) {
    console.error('Error fetching instruments for detection:', error);
  }
  
  // Fallback to common instruments
  return [
    { symbol: 'R_75', display_name: 'Volatility 75 Index', category: 'derived' },
    { symbol: 'R_50', display_name: 'Volatility 50 Index', category: 'derived' },
    { symbol: 'R_100', display_name: 'Volatility 100 Index', category: 'derived' },
    { symbol: 'R_25', display_name: 'Volatility 25 Index', category: 'derived' },
    { symbol: 'R_10', display_name: 'Volatility 10 Index', category: 'derived' },
    { symbol: 'XAUUSD', display_name: 'Gold/USD', category: 'commodities' },
    { symbol: 'GBPJPY', display_name: 'GBP/JPY', category: 'forex' },
    { symbol: 'GBPUSD', display_name: 'GBP/USD', category: 'forex' },
    { symbol: 'EURUSD', display_name: 'EUR/USD', category: 'forex' },
  ];
}
