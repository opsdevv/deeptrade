'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';
import { useAuth } from '@/lib/auth/context';

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
}

interface DerivAccount {
  id: string;
  account_name: string;
  broker: string;
  server: string;
  account_type: 'real' | 'demo';
  account_id: string | null;
  balance: number | null;
  currency: string;
  is_active: boolean;
  is_selected: boolean;
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

export default function SmartTradePage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [derivApiAccounts, setDerivApiAccounts] = useState<DerivApiAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<DerivAccount | null>(null);
  const [selectedDerivAccount, setSelectedDerivAccount] = useState<DerivApiAccount | null>(null);
  const [loadingDerivAccounts, setLoadingDerivAccounts] = useState(false);
  const [derivAccountsError, setDerivAccountsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'all'>('active');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadTrades();
    loadDerivApiAccounts(); // Always call, no auth check
    
    // Set up interval to refresh trades every 10 seconds
    const interval = setInterval(() => {
      loadTrades();
    }, 10000);

    // Set up interval to call monitor endpoint every 30 seconds
    const monitorInterval = setInterval(() => {
      fetch('/api/trades/monitor', { method: 'POST' }).catch(console.error);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(monitorInterval);
    };
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await fetch('/api/deriv/auth');
      const data = await response.json();
      if (data.success && data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts);
        const selected = data.accounts.find((acc: DerivAccount) => acc.is_selected);
        setSelectedAccount(selected || data.accounts[0]);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadDerivApiAccounts = async () => {
    try {
      setLoadingDerivAccounts(true);
      setDerivAccountsError(null);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:108',message:'loadDerivApiAccounts entry',data:{hasUser:!!user,hasSession:!!session,userId:user?.id,authLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      
      const response = await fetch('/api/deriv/accounts', {
        credentials: 'include', // Ensure cookies are sent
      });
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:112',message:'fetch response received',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:115',message:'response data parsed',data:{success:data.success,hasError:!!data.error,errorMessage:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      if (!response.ok) {
        // Handle HTTP errors
        const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Error loading Deriv API accounts:', errorMessage);
        setDerivApiAccounts([]);
        setDerivAccountsError(errorMessage);
        return;
      }
      
      if (data.success && data.accounts && data.accounts.length > 0) {
        setDerivApiAccounts(data.accounts);
        setDerivAccountsError(null);
        // Auto-select first account if none selected
        if (!selectedDerivAccount && data.accounts.length > 0) {
          setSelectedDerivAccount(data.accounts[0]);
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

  const handleSelectAccount = async (accountId: string) => {
    try {
      const response = await fetch('/api/deriv/auth', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ account_id: accountId }),
      });

      const data = await response.json();
      if (data.success) {
        await loadAccounts();
      }
    } catch (error) {
      console.error('Error selecting account:', error);
    }
  };

  const loadTrades = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'all' ? 'all' : activeTab;
      const response = await fetch(`/api/trades?status=${status}`);
      const data = await response.json();
      if (data.success) {
        setTrades(data.trades || []);
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

  const handleCloseTrades = async (filter?: 'losing' | 'profitable') => {
    if (!confirm(`Are you sure you want to close ${filter ? filter : 'all'} trades?`)) {
      return;
    }

    setClosing(true);
    try {
      const response = await fetch('/api/trades/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        headers: {
          'Content-Type': 'application/json',
        },
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

  const calculateTotalPnl = () => {
    return trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
  };

  const activeTrades = trades.filter(t => t.status === 'active' || t.status === 'pending');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const displayedTrades = activeTab === 'active' ? activeTrades : activeTab === 'closed' ? closedTrades : trades;

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-4">Smart Trade</h1>
          
          {/* Deriv API Accounts Selector */}
          <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Deriv API Accounts</h2>
              <button
                onClick={loadDerivApiAccounts}
                disabled={loadingDerivAccounts}
                className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingDerivAccounts ? 'Loading...' : 'Refresh'}
              </button>
            </div>
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
                    {derivAccountsError.includes('log in') || derivAccountsError.includes('Authentication') ? (
                      <p className="text-red-300 text-xs mt-2">
                        Please refresh the page or log in again.
                      </p>
                    ) : derivAccountsError.includes('No active Deriv account') ? (
                      <p className="text-red-300 text-xs mt-2">
                        Go to Settings to add your Deriv account credentials.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <p>No accounts found.</p>
                    <p className="mt-1 text-xs">Make sure you're logged in and have added a Deriv account in Settings.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {derivApiAccounts.map((account) => (
                    <button
                      key={account.account_id}
                      onClick={() => setSelectedDerivAccount(account)}
                      className={`px-4 py-2 rounded-lg font-medium transition text-sm ${
                        selectedDerivAccount?.account_id === account.account_id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {account.account_id}
                      {selectedDerivAccount?.account_id === account.account_id && (
                        <span className="ml-2 text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
                {selectedDerivAccount && (
                  <div className="mt-3 p-3 bg-gray-700 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-400">Account ID:</span>
                        <span className="text-white font-medium ml-2 block">{selectedDerivAccount.account_id}</span>
                      </div>
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
                    </div>
                    {selectedDerivAccount.email && (
                      <div className="mt-2 text-sm">
                        <span className="text-gray-400">Email:</span>
                        <span className="text-white ml-2">{selectedDerivAccount.email}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stored Account Selector (for backward compatibility) */}
          {accounts.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stored Trading Accounts
              </label>
              <div className="flex flex-wrap gap-2">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => handleSelectAccount(account.id)}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      account.is_selected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {account.account_name}
                    {account.is_selected && (
                      <span className="ml-2 text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Show message if no stored accounts and no Deriv API accounts */}
          {accounts.length === 0 && derivApiAccounts.length === 0 && !loadingDerivAccounts && (
            <div className="mb-6 bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
              <h3 className="text-yellow-400 font-semibold mb-2">Setup Required</h3>
              <p className="text-gray-300 text-sm mb-3">
                To view your Deriv accounts, you need to:
              </p>
              <ol className="text-gray-300 text-sm list-decimal list-inside space-y-1 mb-3">
                <li>Make sure you're logged in</li>
                <li>Add a Deriv account in Settings with your login credentials</li>
              </ol>
              <button
                onClick={() => router.push('/settings')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
              >
                Go to Settings
              </button>
            </div>
          )}

          {selectedAccount && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 bg-gray-800 rounded-lg p-4">
              <span>
                Account: <span className="text-white font-medium">{selectedAccount.account_name}</span>
              </span>
              <span>
                Type: <span className="text-white font-medium">{selectedAccount.account_type.toUpperCase()}</span>
              </span>
              <span>
                Broker: <span className="text-white font-medium">{selectedAccount.broker}</span>
              </span>
              <span>
                Server: <span className="text-white font-medium">{selectedAccount.server}</span>
              </span>
              {selectedAccount.balance !== null && (
                <span>
                  Balance: <span className="text-white font-medium">{selectedAccount.balance.toFixed(2)} {selectedAccount.currency}</span>
                </span>
              )}
              <span>
                Total PNL: <span className={`font-medium ${calculateTotalPnl() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calculateTotalPnl().toFixed(2)} {selectedAccount.currency}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'active'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Active ({activeTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'closed'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Closed ({closedTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'all'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            All ({trades.length})
          </button>
        </div>

        {/* Action Buttons */}
        {activeTrades.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => handleCloseTrades()}
              disabled={closing}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All
            </button>
            <button
              onClick={() => handleCloseTrades('losing')}
              disabled={closing}
              className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All Losing
            </button>
            <button
              onClick={() => handleCloseTrades('profitable')}
              disabled={closing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Close All Profitable
            </button>
          </div>
        )}

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
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
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
                              placeholder="Add notes about why this trade worked or didn't..."
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
    </div>
  );
}
