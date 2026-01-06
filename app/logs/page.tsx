'use client';

import { useState, useEffect } from 'react';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';

interface TradeLog {
  id: string;
  trade_id: string | null;
  log_type: 'info' | 'warning' | 'error' | 'trade_executed' | 'trade_closed' | 'price_update' | 'cooldown_started' | 'cooldown_ended';
  message: string;
  data: any;
  created_at: string;
}

interface AutoTrade {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number | null;
  target_price: number | null;
  close_price: number | null;
  current_price: number | null;
  status: 'pending' | 'active' | 'closed' | 'cancelled';
  pnl: number;
  pnl_percentage: number;
  close_reason: string | null;
  setup_data: any;
  trigger_price: number | null;
  trigger_condition: string | null;
  lot_size: number;
  number_of_positions: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [autoTrades, setAutoTrades] = useState<AutoTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'trades'>('logs');
  const [page, setPage] = useState(1);
  const [tradesPage, setTradesPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tradesTotalPages, setTradesTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    log_type: 'all' as string,
    search: '',
  });
  const [tradesFilter, setTradesFilter] = useState({
    status: 'all' as string,
  });

  const pageSize = 50;

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [page, filters, activeTab]);

  useEffect(() => {
    if (activeTab === 'trades') {
      loadAutoTrades();
    }
  }, [tradesPage, tradesFilter, activeTab]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        ...(filters.log_type !== 'all' && { log_type: filters.log_type }),
        ...(filters.search && { search: filters.search }),
      });

      const response = await fetch(`/api/logs?${params}`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAutoTrades = async () => {
    try {
      setLoadingTrades(true);
      const params = new URLSearchParams({
        page: tradesPage.toString(),
        page_size: pageSize.toString(),
        ...(tradesFilter.status !== 'all' && { status: tradesFilter.status }),
      });

      const response = await fetch(`/api/logs/trades?${params}`);
      const data = await response.json();
      if (data.success) {
        setAutoTrades(data.trades || []);
        setTradesTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error('Error loading auto trades:', error);
    } finally {
      setLoadingTrades(false);
    }
  };

  const getLogTypeColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-400 bg-red-900/20 border-red-700';
      case 'warning':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-700';
      case 'trade_executed':
        return 'text-green-400 bg-green-900/20 border-green-700';
      case 'trade_closed':
        return 'text-blue-400 bg-blue-900/20 border-blue-700';
      case 'cooldown_started':
      case 'cooldown_ended':
        return 'text-purple-400 bg-purple-900/20 border-purple-700';
      default:
        return 'text-gray-400 bg-gray-800 border-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Trade Logs & Auto Trades</h1>
          <p className="text-gray-400">View all trading activity, system logs, and auto trade analysis</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'logs'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            System Logs
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'trades'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Auto Trades ({autoTrades.length > 0 ? autoTrades.length : ''})
          </button>
        </div>

        {activeTab === 'logs' ? (
          <>
            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-300 mb-2">Search</label>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    placeholder="Search logs..."
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:w-48">
                  <label className="block text-sm text-gray-300 mb-2">Log Type</label>
                  <select
                    value={filters.log_type}
                    onChange={(e) => setFilters({ ...filters, log_type: e.target.value })}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                    <option value="trade_executed">Trade Executed</option>
                    <option value="trade_closed">Trade Closed</option>
                    <option value="price_update">Price Update</option>
                    <option value="cooldown_started">Cooldown Started</option>
                    <option value="cooldown_ended">Cooldown Ended</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Logs List */}
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                <p className="text-gray-400 mt-2">Loading logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">No logs found</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`bg-gray-800 rounded-lg p-4 border ${getLogTypeColor(log.log_type)}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-1 rounded text-xs font-medium border">
                              {log.log_type.toUpperCase()}
                            </span>
                            {log.trade_id && (
                              <span className="text-xs text-gray-400">
                                Trade: {log.trade_id.substring(0, 8)}...
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-white">{log.message}</p>
                          {log.data && Object.keys(log.data).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                                View Details
                              </summary>
                              <pre className="mt-2 text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTimeOnlyWithTimezone(log.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 bg-gray-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
                    >
                      Previous
                    </button>
                    <span className="text-gray-400">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 bg-gray-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Auto Trades Filters */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="sm:w-48">
                  <label className="block text-sm text-gray-300 mb-2">Status</label>
                  <select
                    value={tradesFilter.status}
                    onChange={(e) => {
                      setTradesFilter({ ...tradesFilter, status: e.target.value });
                      setTradesPage(1);
                    }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Auto Trades List */}
            {loadingTrades ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                <p className="text-gray-400 mt-2">Loading auto trades...</p>
              </div>
            ) : autoTrades.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">No auto trades found</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {autoTrades.map((trade) => {
                    const isProfit = trade.pnl >= 0;
                    const setupData = trade.setup_data || {};
                    
                    return (
                      <div
                        key={trade.id}
                        className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700"
                      >
                        <div className="flex flex-col gap-4">
                          {/* Trade Header */}
                          <div className="flex flex-wrap items-center gap-3">
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
                            <span className="text-xs text-gray-400">
                              {formatTimeOnlyWithTimezone(trade.created_at)}
                            </span>
                          </div>

                          {/* Trade Details Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Entry Price:</span>
                              <span className="text-white ml-2 font-medium">{trade.entry_price.toFixed(5)}</span>
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
                            {trade.close_price && (
                              <div>
                                <span className="text-gray-400">Close Price:</span>
                                <span className="text-white ml-2 font-medium">{trade.close_price.toFixed(5)}</span>
                              </div>
                            )}
                            {trade.current_price && !trade.close_price && (
                              <div>
                                <span className="text-gray-400">Current:</span>
                                <span className="text-white ml-2 font-medium">{trade.current_price.toFixed(5)}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-400">Lot Size:</span>
                              <span className="text-white ml-2">{trade.lot_size}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Positions:</span>
                              <span className="text-white ml-2">{trade.number_of_positions}</span>
                            </div>
                          </div>

                          {/* PNL */}
                          <div>
                            <span className="text-gray-400 text-sm">PNL:</span>
                            <span
                              className={`ml-2 font-bold text-lg ${
                                isProfit ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {trade.pnl.toFixed(2)} ({trade.pnl_percentage.toFixed(2)}%)
                            </span>
                          </div>

                          {/* Setup/Analysis Data */}
                          {Object.keys(setupData).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-sm text-gray-300 cursor-pointer hover:text-white font-medium">
                                View Setup/Analysis Data
                              </summary>
                              <div className="mt-2 p-3 bg-gray-700 rounded">
                                <pre className="text-xs text-gray-300 overflow-x-auto">
                                  {JSON.stringify(setupData, null, 2)}
                                </pre>
                              </div>
                            </details>
                          )}

                          {/* Outcome */}
                          {trade.status === 'closed' && trade.close_reason && (
                            <div className="mt-2">
                              <span className="text-gray-400 text-sm">Close Reason:</span>
                              <span className="text-white ml-2 text-sm">{trade.close_reason}</span>
                            </div>
                          )}

                          {/* Trigger Info */}
                          {trade.trigger_price && (
                            <div className="mt-2 text-xs text-gray-400">
                              <span>Trigger Price: {trade.trigger_price.toFixed(5)}</span>
                              {trade.trigger_condition && (
                                <span className="ml-4">Condition: {trade.trigger_condition}</span>
                              )}
                            </div>
                          )}

                          {/* Timestamps */}
                          <div className="text-xs text-gray-500">
                            <div>Created: {formatTimeOnlyWithTimezone(trade.created_at)}</div>
                            {trade.closed_at && (
                              <div>Closed: {formatTimeOnlyWithTimezone(trade.closed_at)}</div>
                            )}
                            <div>Updated: {formatTimeOnlyWithTimezone(trade.updated_at)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {tradesTotalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setTradesPage(p => Math.max(1, p - 1))}
                      disabled={tradesPage === 1}
                      className="px-4 py-2 bg-gray-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
                    >
                      Previous
                    </button>
                    <span className="text-gray-400">
                      Page {tradesPage} of {tradesTotalPages}
                    </span>
                    <button
                      onClick={() => setTradesPage(p => Math.min(tradesTotalPages, p + 1))}
                      disabled={tradesPage === tradesTotalPages}
                      className="px-4 py-2 bg-gray-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
