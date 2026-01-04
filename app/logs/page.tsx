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

export default function LogsPage() {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    log_type: 'all' as string,
    search: '',
  });

  const pageSize = 50;

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

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
          <h1 className="text-3xl font-bold text-white mb-2">Trade Logs</h1>
          <p className="text-gray-400">View all trading activity and system logs</p>
        </div>

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
      </div>
    </div>
  );
}
