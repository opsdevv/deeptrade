'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';
import { subscribeToTicks } from '@/lib/api/deriv';

interface Trade {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number | null;
  target_price: number | null;
  lot_size: number;
  number_of_positions: number;
  current_price: number | null;
  status: 'pending' | 'active' | 'closed' | 'cancelled';
  pnl: number;
  pnl_percentage: number;
  close_price: number | null;
  close_reason: string | null;
  notes: string | null;
  trigger_price: number | null;
  trigger_condition: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  contract_id?: string;
  contract_type?: string;
}

interface DerivApiAccount {
  account_id: string;
  account_type: string;
  balance?: number;
  currency?: string;
  email?: string;
  loginid?: string;
  country?: string;
  landing_company_name?: string;
  landing_company_shortcode?: string;
  is_virtual?: number;
}

interface Instrument {
  symbol: string;
  display_name: string;
  category?: string;
}

interface SetupCondition {
  id: string;
  label: string;
  met: boolean;
}

interface AnalysisStatus {
  analyzing: boolean;
  setupFound: boolean;
  conditions: SetupCondition[];
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  direction?: 'long' | 'short';
  timeframe: string;
}

export default function SmartTradePage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [derivApiAccounts, setDerivApiAccounts] = useState<DerivApiAccount[]>([]);
  const [selectedDerivAccount, setSelectedDerivAccount] = useState<DerivApiAccount | null>(null);
  const [loadingDerivAccounts, setLoadingDerivAccounts] = useState(false);
  const [derivAccountsError, setDerivAccountsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'all' | 'history'>('active');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [closing, setClosing] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [autotrading, setAutotrading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>({
    analyzing: false,
    setupFound: false,
    conditions: [],
    timeframe: '2m',
  });
  const [totalPnl, setTotalPnl] = useState(0);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickSubscriptionRef = useRef<(() => void) | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [entryZoneReached, setEntryZoneReached] = useState(false);
  const [lotSize, setLotSize] = useState<number>(1); // Minimum lot size (stake amount) for Deriv contracts
  const [numberOfPositions, setNumberOfPositions] = useState<number>(1);

  useEffect(() => {
    loadAccounts();
    loadTrades();
    loadInstruments();
    
    // Set up interval to refresh trades every 10 seconds
    const interval = setInterval(() => {
      loadTrades();
    }, 10000);

    // Set up interval to refresh account balances every 60 seconds
    const balanceInterval = setInterval(() => {
      loadAccounts();
    }, 60000);

    // Set up interval to call monitor endpoint every 30 seconds
    const monitorInterval = setInterval(() => {
      fetch('/api/trades/monitor', { method: 'POST' }).catch(console.error);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(balanceInterval);
      clearInterval(monitorInterval);
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      stopRealTimeMonitoring();
    };
  }, []);

  useEffect(() => {
    if (autotrading && selectedInstrument && selectedDerivAccount) {
      startAnalysis();
    } else {
      stopAnalysis();
    }
  }, [autotrading, selectedInstrument, selectedDerivAccount]);

  const loadAccounts = async () => {
    try {
      setLoadingDerivAccounts(true);
      setDerivAccountsError(null);
      
      const response = await fetch('/api/deriv/accounts', {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Error loading Deriv API accounts:', errorMessage);
        setDerivApiAccounts([]);
        setDerivAccountsError(errorMessage);
        return;
      }
      
      if (data.success && data.accounts && data.accounts.length > 0) {
        setDerivApiAccounts(data.accounts);
        setDerivAccountsError(null);
        if (!selectedDerivAccount && data.accounts.length > 0) {
          setSelectedDerivAccount(data.accounts[0]);
        } else if (selectedDerivAccount) {
          // Update selected account with latest data (including balance)
          const updatedAccount = data.accounts.find(
            (acc: DerivApiAccount) => acc.account_id === selectedDerivAccount.account_id
          );
          if (updatedAccount) {
            setSelectedDerivAccount(updatedAccount);
          }
        }
      } else if (data.error) {
        console.error('Error loading Deriv API accounts:', data.error);
        setDerivApiAccounts([]);
        setDerivAccountsError(data.error);
      }
    } catch (error: any) {
      console.error('Error loading Deriv API accounts:', error);
      setDerivApiAccounts([]);
      const errorMessage = error.message || 'Failed to load accounts';
      setDerivAccountsError(errorMessage);
    } finally {
      setLoadingDerivAccounts(false);
    }
  };

  const loadInstruments = async () => {
    try {
      const response = await fetch('/api/instruments');
      const data = await response.json();
      if (data.success && data.instruments) {
        setInstruments(data.instruments);
        if (data.instruments.length > 0 && !selectedInstrument) {
          setSelectedInstrument(data.instruments[0].symbol);
        }
      }
    } catch (error) {
      console.error('Error loading instruments:', error);
    }
  };

  const loadTrades = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'all' ? 'all' : activeTab === 'history' ? 'all' : activeTab;
      const response = await fetch(`/api/trades?status=${status}`);
      const data = await response.json();
      if (data.success) {
        setTrades(data.trades || []);
        const total = (data.trades || []).reduce((sum: number, trade: Trade) => sum + (trade.pnl || 0), 0);
        setTotalPnl(total);
      }
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
  }, [activeTab]);

  const startAnalysis = () => {
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    
    // Start analyzing immediately
    analyzeAndFindSetup();
    
    // Then analyze every 2 minutes (120 seconds)
    analysisIntervalRef.current = setInterval(() => {
      analyzeAndFindSetup();
    }, 120000);
  };

  const stopAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
    stopRealTimeMonitoring();
    setAnalysisStatus({
      analyzing: false,
      setupFound: false,
      conditions: [],
      timeframe: analysisStatus.timeframe,
    });
  };

  const analyzeAndFindSetup = async () => {
    if (!selectedInstrument) return;
    
    setAnalysisStatus(prev => ({ ...prev, analyzing: true }));
    
    try {
      // Create simplified conditions for setup detection
      // In a real implementation, this would call the analysis API
      const conditions: SetupCondition[] = [
        { id: '1', label: 'Price action aligned with bias', met: false },
        { id: '2', label: 'Liquidity sweep confirmed', met: false },
        { id: '3', label: 'FVG present', met: false },
        { id: '4', label: 'Entry zone reached', met: false },
        { id: '5', label: 'Confirmation signal', met: false },
      ];

      // Simulate analysis - replace with actual API call
      // For now, we'll use a simplified approach
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument: selectedInstrument,
          timeframes: ['2h', '15m', '5m'], // Using existing timeframes for now
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.result) {
          const result = data.result;
          
          // Update conditions based on analysis
          conditions[0].met = result.final_decision === 'TRADE_SETUP';
          conditions[1].met = result.timeframe_15m?.liquidity_taken || false;
          conditions[2].met = result.timeframe_15m?.fvg_present || false;
          
          const entryPrice = result.timeframe_5m?.entry_price;
          const direction = result.timeframe_5m?.direction;
          
          // Fetch current price if we have an entry price (for entry zone check)
          let fetchedPrice = currentPrice;
          if (entryPrice && !currentPrice && result.final_decision === 'TRADE_SETUP') {
            try {
              // Try to get current price from the analysis result or fetch it
              // The analysis might include current price info, otherwise WebSocket will provide it
              // For now, we'll rely on WebSocket to provide the price once monitoring starts
              fetchedPrice = null;
            } catch (e) {
              // Ignore price fetch errors, WebSocket will provide it
            }
          }
          
          // Check if entry zone is reached (within 0.1% of entry price)
          let isInEntryZone = false;
          if (entryPrice && (fetchedPrice || currentPrice)) {
            const price = fetchedPrice || currentPrice;
            const threshold = entryPrice * 0.001;
            if (direction === 'long') {
              isInEntryZone = price! <= entryPrice + threshold && price! >= entryPrice - threshold * 2;
            } else if (direction === 'short') {
              isInEntryZone = price! >= entryPrice - threshold && price! <= entryPrice + threshold * 2;
            } else {
              isInEntryZone = Math.abs(price! - entryPrice) <= threshold;
            }
          }
          
          conditions[3].met = isInEntryZone;
          conditions[4].met = result.timeframe_5m?.trade_signal || false;

          setAnalysisStatus({
            analyzing: false,
            setupFound: result.final_decision === 'TRADE_SETUP',
            conditions,
            entryPrice,
            stopLoss: result.timeframe_5m?.stop_price,
            targetPrice: result.timeframe_5m?.target_price,
            direction,
            timeframe: analysisStatus.timeframe,
          });

          // If setup found with entry price, start real-time monitoring
          // This ensures we catch entry zone entry even if price isn't there yet
          if (result.final_decision === 'TRADE_SETUP' && entryPrice && direction) {
            if (isInEntryZone) {
              setEntryZoneReached(true);
            }
            // Always start monitoring when we have a setup with entry price
            startRealTimeMonitoring(selectedInstrument, entryPrice, direction, result.timeframe_5m?.stop_price, result.timeframe_5m?.target_price);
          } else {
            setEntryZoneReached(false);
            stopRealTimeMonitoring();
          }

          // If setup found and all conditions met, create pending trade
          if (result.final_decision === 'TRADE_SETUP' && result.timeframe_5m?.trade_signal) {
            await createPendingTrade(result);
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing:', error);
      setAnalysisStatus(prev => ({ ...prev, analyzing: false }));
    }
  };

  // Helper function to check if price is in entry zone
  const checkEntryZone = (entryPrice: number, currentPrice: number, direction?: 'long' | 'short'): boolean => {
    if (!currentPrice || !entryPrice) return false;
    
    // Consider price in entry zone if within 0.1% of entry price
    const threshold = entryPrice * 0.001;
    
    if (direction === 'long') {
      // For long, entry zone is around and below entry price
      return currentPrice <= entryPrice + threshold && currentPrice >= entryPrice - threshold * 2;
    } else if (direction === 'short') {
      // For short, entry zone is around and above entry price
      return currentPrice >= entryPrice - threshold && currentPrice <= entryPrice + threshold * 2;
    }
    
    // If no direction, check if price is close to entry
    return Math.abs(currentPrice - entryPrice) <= threshold;
  };

  // Start real-time WebSocket monitoring
  const startRealTimeMonitoring = (
    symbol: string,
    entryPrice: number,
    direction: 'long' | 'short',
    stopLoss?: number,
    targetPrice?: number
  ) => {
    // Clean up existing subscription
    if (tickSubscriptionRef.current) {
      tickSubscriptionRef.current();
      tickSubscriptionRef.current = null;
    }

    console.log(`[WebSocket] Starting real-time price monitoring for ${symbol} - Entry: ${entryPrice}, Direction: ${direction}`);
    
    const unsubscribe = subscribeToTicks(symbol, (tick) => {
      setCurrentPrice(tick.price);
      
      // Check if price is now in entry zone
      const threshold = entryPrice * 0.001;
      let inEntryZone = false;
      
      if (direction === 'long') {
        inEntryZone = tick.price <= entryPrice + threshold && tick.price >= entryPrice - threshold * 2;
      } else if (direction === 'short') {
        inEntryZone = tick.price >= entryPrice - threshold && tick.price <= entryPrice + threshold * 2;
      }
      
      // Update entry zone status
      if (inEntryZone && !entryZoneReached) {
        setEntryZoneReached(true);
        console.log(`[WebSocket] Price entered entry zone: ${tick.price}`);
      }
      
      // Check if entry confirmation has occurred (price breaks through entry)
      let entryConfirmed = false;
      if (direction === 'long' && tick.price >= entryPrice) {
        // Price broke above entry for long
        entryConfirmed = true;
        console.log(`[WebSocket] Entry confirmed for LONG: ${tick.price} >= ${entryPrice}`);
      } else if (direction === 'short' && tick.price <= entryPrice) {
        // Price broke below entry for short
        entryConfirmed = true;
        console.log(`[WebSocket] Entry confirmed for SHORT: ${tick.price} <= ${entryPrice}`);
      }
      
      if (entryConfirmed) {
        handleEntryConfirmation(symbol, tick.price, direction, entryPrice, stopLoss, targetPrice);
      }
    });

    tickSubscriptionRef.current = unsubscribe;
  };

  // Stop real-time monitoring
  const stopRealTimeMonitoring = () => {
    if (tickSubscriptionRef.current) {
      console.log('[WebSocket] Stopping real-time price monitoring');
      tickSubscriptionRef.current();
      tickSubscriptionRef.current = null;
    }
    setCurrentPrice(null);
    setEntryZoneReached(false);
  };

  // Handle entry confirmation - execute trade immediately
  const handleEntryConfirmation = async (
    symbol: string,
    price: number,
    direction: 'long' | 'short',
    entryPrice: number,
    stopLoss?: number,
    targetPrice?: number
  ) => {
    // Check if we already have a pending trade for this symbol
    const existingPendingTrade = trades.find(
      t => t.symbol === symbol && t.status === 'pending'
    );

    if (existingPendingTrade) {
      // Trade already exists, monitor endpoint will handle execution
      console.log('[WebSocket] Pending trade already exists, monitor will handle execution');
      return;
    }

    // Execute trade immediately via API
    try {
      const response = await fetch('/api/trades/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          direction,
          entry_price: price,
          stop_loss: stopLoss,
          target_price: targetPrice,
          lot_size: lotSize,
          number_of_positions: numberOfPositions,
          account_id: selectedDerivAccount?.account_id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('[WebSocket] Trade executed successfully');
          loadTrades();
          // Stop monitoring since trade is executed
          stopRealTimeMonitoring();
        }
      }
    } catch (error) {
      console.error('Error executing trade on entry confirmation:', error);
    }
  };

  const createPendingTrade = async (analysisResult: any) => {
    if (!selectedDerivAccount || !selectedInstrument) return;

    try {
      const response = await fetch('/api/trades/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedInstrument,
          setups: [{
            type: analysisResult.timeframe_5m.direction === 'long' ? 'bullish' : 'bearish',
            entryZone: analysisResult.timeframe_5m.entry_zone,
            stopLoss: analysisResult.timeframe_5m.stop_level,
            target: analysisResult.timeframe_5m.target_zone,
            trigger: 'Auto-entry on confirmation',
          }],
          lot_size: lotSize,
          number_of_positions: numberOfPositions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          loadTrades();
        }
      }
    } catch (error) {
      console.error('Error creating trade:', error);
    }
  };

  const handleCloseTrades = async (filter?: 'losing' | 'profitable') => {
    if (!confirm(`Are you sure you want to close ${filter ? filter : 'all'} trades?`)) {
      return;
    }

    setClosing(true);
    try {
      const response = await fetch('/api/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Closed ${data.closed_trades?.length || 0} trade(s). Total PNL: ${data.total_pnl?.toFixed(2) || 0}`);
        loadTrades();
      } else {
        alert(data.error || 'Failed to close trades');
      }
    } catch (error: any) {
      console.error('Error closing trades:', error);
      alert('Error closing trades: ' + error.message);
    } finally {
      setClosing(false);
    }
  };

  const handleUpdateNotes = async (tradeId: string) => {
    try {
      const response = await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_id: tradeId,
          action: 'update_notes',
          notes: notesValue,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setEditingNotes(null);
        setNotesValue('');
        loadTrades();
      } else {
        alert(data.error || 'Failed to update notes');
      }
    } catch (error: any) {
      console.error('Error updating notes:', error);
      alert('Error updating notes: ' + error.message);
    }
  };

  const handleStopAutotrading = () => {
    setAutotrading(false);
  };

  const activeTrades = trades.filter(t => t.status === 'active' || t.status === 'pending');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const displayedTrades = activeTab === 'active' ? activeTrades : activeTab === 'closed' ? closedTrades : activeTab === 'history' ? trades : trades;

  return (
    <div className="min-h-screen bg-gray-900 pb-24">
      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-4">Smart Trade</h1>
          
          {/* Account Selector - At the top */}
          <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Deriv Account (Real/Demo)
            </label>
            {loadingDerivAccounts ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
                <p className="text-gray-400 mt-2 text-sm">Loading accounts...</p>
              </div>
            ) : derivApiAccounts.length === 0 ? (
              <div className="text-gray-400 text-sm">
                {derivAccountsError ? (
                  <div className="bg-red-900/20 border border-red-700 rounded p-3">
                    <p className="text-red-400 font-medium mb-1">Error loading accounts</p>
                    <p className="text-red-300 text-xs">{derivAccountsError}</p>
                  </div>
                ) : (
                  <p>No accounts found. Please add a Deriv account in Settings.</p>
                )}
              </div>
            ) : (
              <select
                value={selectedDerivAccount?.account_id || ''}
                onChange={(e) => {
                  const account = derivApiAccounts.find(acc => acc.account_id === e.target.value);
                  setSelectedDerivAccount(account || null);
                  // Refresh balances when account is selected
                  if (account) {
                    loadAccounts();
                  }
                }}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[...derivApiAccounts]
                  .sort((a, b) => {
                    // Sort: Real accounts first, then Demo
                    if (a.is_virtual !== b.is_virtual) {
                      return (a.is_virtual || 0) - (b.is_virtual || 0);
                    }
                    // Then sort by balance (descending)
                    const balanceA = a.balance || 0;
                    const balanceB = b.balance || 0;
                    return balanceB - balanceA;
                  })
                  .map((account) => {
                    const balanceText = account.balance !== undefined && account.balance !== null
                      ? `${account.balance.toFixed(2)} ${account.currency || 'USD'}`
                      : 'N/A';
                    const accountType = account.is_virtual ? 'Demo' : 'Real';
                    return (
                      <option key={account.account_id} value={account.account_id}>
                        {balanceText} - {account.account_id} ({accountType})
                      </option>
                    );
                  })}
              </select>
            )}
            {selectedDerivAccount && (
              <div className="mt-3 p-3 bg-gray-700 rounded-lg text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-gray-400">Balance:</span>
                    <span className="text-white font-medium ml-2 block">
                      {selectedDerivAccount.balance !== undefined 
                        ? `${selectedDerivAccount.balance.toFixed(2)} ${selectedDerivAccount.currency || 'USD'}`
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Type:</span>
                    <span className="text-white font-medium ml-2 block">
                      {selectedDerivAccount.is_virtual ? 'Demo' : 'Real'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Company:</span>
                    <span className="text-white font-medium ml-2 block">
                      {selectedDerivAccount.landing_company_shortcode || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Total PNL:</span>
                    <span className={`font-medium ml-2 block ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {totalPnl.toFixed(2)} {selectedDerivAccount.currency || 'USD'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Instrument Selector and Autotrading Controls */}
          <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Instrument
                </label>
                <select
                  value={selectedInstrument}
                  onChange={(e) => setSelectedInstrument(e.target.value)}
                  disabled={autotrading}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {instruments.map((inst) => (
                    <option key={inst.symbol} value={inst.symbol}>
                      {inst.display_name || inst.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Timeframe (Analysis)
                </label>
                <select
                  value={analysisStatus.timeframe}
                  onChange={(e) => setAnalysisStatus(prev => ({ ...prev, timeframe: e.target.value }))}
                  disabled={autotrading}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="2m">2 Minutes</option>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Lot Size (Stake)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={lotSize}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value >= 1) {
                      setLotSize(value);
                    }
                  }}
                  disabled={autotrading}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="1"
                />
                <p className="text-xs text-gray-400 mt-1">Minimum: 1</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Number of Positions
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={numberOfPositions}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1) {
                      setNumberOfPositions(value);
                    }
                  }}
                  disabled={autotrading}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="1"
                />
              </div>
              <div className="flex gap-2">
                {!autotrading ? (
                  <button
                    onClick={() => setAutotrading(true)}
                    disabled={!selectedInstrument || !selectedDerivAccount || lotSize < 1 || numberOfPositions < 1}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Start Autotrading
                  </button>
                ) : (
                  <button
                    onClick={handleStopAutotrading}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Stop Autotrading
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Setup Analysis Status */}
          {autotrading && (
            <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3">Setup Analysis</h3>
              {analysisStatus.analyzing ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
                  <span className="text-gray-300">Analyzing {selectedInstrument} on {analysisStatus.timeframe} timeframe...</span>
                </div>
              ) : analysisStatus.setupFound ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-green-400 font-semibold">✓ Setup Found!</span>
                    {analysisStatus.direction && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        analysisStatus.direction === 'long' ? 'bg-green-600' : 'bg-red-600'
                      } text-white`}>
                        {analysisStatus.direction.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {analysisStatus.conditions.map((condition) => (
                      <div key={condition.id} className="flex items-center gap-2">
                        <span className={condition.met ? 'text-green-400' : 'text-gray-500'}>
                          {condition.met ? '✓' : '○'}
                        </span>
                        <span className={condition.met ? 'text-white' : 'text-gray-400'}>
                          {condition.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {analysisStatus.entryPrice && (
                    <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-gray-400">Entry:</span>
                        <span className="text-white ml-2">{analysisStatus.entryPrice.toFixed(5)}</span>
                      </div>
                      {analysisStatus.stopLoss && (
                        <div>
                          <span className="text-gray-400">Stop Loss:</span>
                          <span className="text-white ml-2">{analysisStatus.stopLoss.toFixed(5)}</span>
                        </div>
                      )}
                      {analysisStatus.targetPrice && (
                        <div>
                          <span className="text-gray-400">Target:</span>
                          <span className="text-white ml-2">{analysisStatus.targetPrice.toFixed(5)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Live Monitoring Status */}
                  {entryZoneReached && currentPrice && (
                    <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          <span className="text-blue-400 font-semibold">Live Monitoring Active</span>
                        </div>
                        <span className="text-white font-medium">Current Price: {currentPrice.toFixed(5)}</span>
                      </div>
                      <p className="text-blue-300 text-sm mt-1">
                        Waiting for entry confirmation at {analysisStatus.entryPrice?.toFixed(5)}...
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-gray-400">Waiting for setup...</span>
                  <div className="space-y-2">
                    {analysisStatus.conditions.map((condition) => (
                      <div key={condition.id} className="flex items-center gap-2">
                        <span className="text-gray-500">○</span>
                        <span className="text-gray-400">{condition.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-700 overflow-x-auto">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'active'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Active ({activeTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'closed'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Closed ({closedTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'all'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            All ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'history'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            History
          </button>
        </div>

        {/* Trades List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="text-gray-400 mt-2">Loading trades...</p>
          </div>
        ) : displayedTrades.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No {activeTab} trades found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedTrades.map((trade) => {
              const currentPrice = trade.current_price || trade.entry_price;
              const pnl = trade.pnl || 0;
              const pnlPercentage = trade.pnl_percentage || 0;
              const isProfit = pnl >= 0;

              return (
                <div
                  key={trade.id}
                  className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    {/* Trade Info */}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className="text-lg font-bold text-white">{trade.symbol}</span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            trade.direction === 'long'
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {trade.direction.toUpperCase()}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            trade.status === 'active'
                              ? 'bg-blue-600 text-white'
                              : trade.status === 'pending'
                              ? 'bg-yellow-600 text-white'
                              : trade.status === 'closed'
                              ? 'bg-gray-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {trade.status.toUpperCase()}
                        </span>
                        {trade.contract_id && (
                          <span className="text-xs text-gray-400">Contract: {trade.contract_id}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-gray-400">Entry:</span>
                          <span className="text-white ml-2 font-medium">{trade.entry_price.toFixed(5)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Current:</span>
                          <span className="text-white ml-2 font-medium">{currentPrice.toFixed(5)}</span>
                        </div>
                        {trade.stop_loss && (
                          <div>
                            <span className="text-gray-400">Stop Loss:</span>
                            <span className="text-white ml-2 font-medium">{trade.stop_loss.toFixed(5)}</span>
                          </div>
                        )}
                        {trade.target_price && (
                          <div>
                            <span className="text-gray-400">Target:</span>
                            <span className="text-white ml-2 font-medium">{trade.target_price.toFixed(5)}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Lot Size:</span>
                          <span className="text-white ml-2">{trade.lot_size}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Positions:</span>
                          <span className="text-white ml-2">{trade.number_of_positions}</span>
                        </div>
                        {trade.trigger_price && (
                          <div>
                            <span className="text-gray-400">Trigger:</span>
                            <span className="text-white ml-2">{trade.trigger_price.toFixed(5)}</span>
                          </div>
                        )}
                      </div>

                      {trade.status === 'closed' && trade.close_reason && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-400">Close Reason:</span>
                          <span className="text-white ml-2">{trade.close_reason}</span>
                        </div>
                      )}

                      {/* PNL */}
                      <div className="mt-3">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-gray-400 text-sm">PNL:</span>
                            <span
                              className={`ml-2 font-bold text-lg ${
                                isProfit ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {pnl.toFixed(2)} ({pnlPercentage.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="mt-4">
                        {editingNotes === trade.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={notesValue}
                              onChange={(e) => setNotesValue(e.target.value)}
                              placeholder="Add notes about this trade..."
                              className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateNotes(trade.id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3 rounded"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingNotes(null);
                                  setNotesValue('');
                                }}
                                className="bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-3 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <span className="text-gray-400 text-sm">Notes:</span>
                                <p className="text-white text-sm mt-1">
                                  {trade.notes || (
                                    <span className="text-gray-500 italic">No notes yet</span>
                                  )}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  setEditingNotes(trade.id);
                                  setNotesValue(trade.notes || '');
                                }}
                                className="text-blue-400 hover:text-blue-300 text-sm ml-2"
                              >
                                {trade.notes ? 'Edit' : 'Add Notes'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Timestamps */}
                      <div className="mt-3 text-xs text-gray-500">
                        <div>Created: {formatTimeOnlyWithTimezone(trade.created_at)}</div>
                        {trade.closed_at && (
                          <div>Closed: {formatTimeOnlyWithTimezone(trade.closed_at)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      {activeTrades.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4 z-50">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => handleCloseTrades()}
              disabled={closing}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All Trades
            </button>
            <button
              onClick={() => handleCloseTrades('losing')}
              disabled={closing}
              className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All Losing Trades
            </button>
            <button
              onClick={() => handleCloseTrades('profitable')}
              disabled={closing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All Winning Trades
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
