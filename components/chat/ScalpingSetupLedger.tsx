'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ScalpingSetup {
  type: 'bullish' | 'bearish';
  price: string;
  entryZone: string;
  stopLoss: string;
  target: string;
  percentMove: string;
  trigger: string;
}

interface ScalpingSetupLedgerProps {
  setups: ScalpingSetup[];
  symbol: string;
  messageId: string;
}

export default function ScalpingSetupLedger({ setups, symbol, messageId }: ScalpingSetupLedgerProps) {
  const [lotSize, setLotSize] = useState('0.01'); // Minimum lot size
  const [numPositions, setNumPositions] = useState('1');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLedger = async () => {
    if (!lotSize || parseFloat(lotSize) <= 0) {
      alert('Please enter a valid lot size');
      return;
    }

    if (!numPositions || parseInt(numPositions) < 1) {
      alert('Please enter a valid number of positions');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/trades/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          setups,
          symbol,
          lot_size: parseFloat(lotSize),
          number_of_positions: parseInt(numPositions),
          message_id: messageId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Navigate to Smart Trade page
        router.push('/smart-trade');
      } else {
        alert(data.error || 'Failed to create trades');
      }
    } catch (error: any) {
      console.error('Error creating trades:', error);
      alert('Error creating trades: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
      <h4 className="text-sm font-semibold text-white mb-3">Automated Trading Setup</h4>
      
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-300 mb-1">Lot Size</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.01"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-300 mb-1">Number of Positions</label>
            <input
              type="number"
              min="1"
              value={numPositions}
              onChange={(e) => setNumPositions(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1"
            />
          </div>
        </div>
        
        <button
          onClick={handleLedger}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition text-sm"
        >
          {loading ? 'Creating Trades...' : '[Ledger] Start Automated Trading'}
        </button>
      </div>
    </div>
  );
}

/**
 * Parse chat message to extract scalping setups
 * Expected format:
 * **Bullish Setup (If {price} holds):**
 * - Entry Zone: -
 * - Stop Loss: 
 * - Target: - (% move)
 * - Trigger: Break above {price} with momentum
 */
export function parseScalpingSetups(content: string): ScalpingSetup[] {
  const setups: ScalpingSetup[] = [];
  
  // Pattern to match bullish setup - more flexible
  const bullishPattern = /\*\*Bullish Setup.*?If\s*\{?([0-9.]+)\}?\s*holds.*?\*\*:?\s*\n- Entry Zone:\s*([^\n]+)\n- Stop Loss:\s*([^\n]+)\n- Target:\s*([^\n]+)\s*\(([^)]+)% move\)\n- Trigger:\s*([^\n]+)/is;
  const bullishMatch = content.match(bullishPattern);
  
  if (bullishMatch) {
    setups.push({
      type: 'bullish',
      price: bullishMatch[1],
      entryZone: bullishMatch[2].trim() || '-',
      stopLoss: bullishMatch[3].trim() || '',
      target: bullishMatch[4].trim() || '-',
      percentMove: bullishMatch[5].trim() || '',
      trigger: bullishMatch[6].trim() || `Break above ${bullishMatch[1]} with momentum`,
    });
  }
  
  // Pattern to match bearish setup - more flexible
  const bearishPattern = /\*\*Bearish Setup.*?If\s*\{?([0-9.]+)\}?\s*breaks.*?\*\*:?\s*\n- Entry Zone:\s*([^\n]+)\n- Stop Loss:\s*([^\n]+)\n- Target:\s*([^\n]+)\s*\(([^)]+)% move\)\n- Trigger:\s*([^\n]+)/is;
  const bearishMatch = content.match(bearishPattern);
  
  if (bearishMatch) {
    setups.push({
      type: 'bearish',
      price: bearishMatch[1],
      entryZone: bearishMatch[2].trim() || '-',
      stopLoss: bearishMatch[3].trim() || '',
      target: bearishMatch[4].trim() || '-',
      percentMove: bearishMatch[5].trim() || '',
      trigger: bearishMatch[6].trim() || `Break below ${bearishMatch[1]} with displacement`,
    });
  }
  
  // Fallback: try to find setups even if format is slightly different
  if (setups.length === 0) {
    // Look for any mention of bullish/bearish setup
    const hasBullish = /bullish setup/i.test(content) && /entry zone/i.test(content);
    const hasBearish = /bearish setup/i.test(content) && /entry zone/i.test(content);
    
    // Try to extract price from context
    const priceMatches = content.match(/\{?([0-9]{1,6}\.[0-9]{1,6})\}?/g);
    const prices = priceMatches ? priceMatches.map(m => m.replace(/[{}]/g, '')) : [];
    
    if (hasBullish && prices.length > 0) {
      setups.push({
        type: 'bullish',
        price: prices[0],
        entryZone: '-',
        stopLoss: '',
        target: '-',
        percentMove: '',
        trigger: `Break above ${prices[0]} with momentum`,
      });
    }
    
    if (hasBearish && prices.length > 0) {
      setups.push({
        type: 'bearish',
        price: prices[0],
        entryZone: '-',
        stopLoss: '',
        target: '-',
        percentMove: '',
        trigger: `Break below ${prices[0]} with displacement`,
      });
    }
  }
  
  return setups;
}
