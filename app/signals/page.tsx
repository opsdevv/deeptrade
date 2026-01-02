'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import { formatPrice, formatTimeWithTimezone } from '@/lib/utils/price-format';
import ClickablePrice from '@/components/ui/ClickablePrice';

interface WatchlistSignal {
  id: string;
  user_id: string;
  instrument: string;
  analysis_run_id: string | null;
  status: 'watching' | 'signal_ready' | 'active' | 'hit_sl' | 'hit_tp' | 'closed';
  direction: 'long' | 'short' | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number[] | null;
  current_price: number | null;
  price_updated_at: string | null;
  last_analyzed_at: string | null;
  added_at: string;
  signal_generated_at: string | null;
  trade_started_at: string | null;
  trade_closed_at: string | null;
  exit_price: number | null;
  exit_reason: 'tp' | 'sl' | 'manual' | null;
  notes: string | null;
  analysis_data: any;
  created_at: string;
  updated_at: string;
}

export default function SignalsPage() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<WatchlistSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'watching' | 'signal_ready' | 'active' | 'closed'>('all');
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingSignalId, setAnalyzingSignalId] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await fetch(`/api/signals?user_id=${user.id}`);
      const data = await response.json();

      if (data.success) {
        setSignals(data.signals || []);
      } else {
        console.error('Failed to fetch signals:', data.error);
      }
    } catch (error) {
      console.error('Error fetching signals:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const updatePrices = useCallback(async () => {
    if (!user?.id || updatingPrices) return;

    setUpdatingPrices(true);
    try {
      const activeSignalIds = signals
        .filter(s => ['watching', 'signal_ready', 'active'].includes(s.status))
        .map(s => s.id);

      if (activeSignalIds.length === 0) {
        setUpdatingPrices(false);
        return;
      }

      const response = await fetch('/api/signals/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          signal_ids: activeSignalIds,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh signals to get updated prices
        await fetchSignals();
      }
    } catch (error) {
      console.error('Error updating prices:', error);
    } finally {
      setUpdatingPrices(false);
    }
  }, [user?.id, signals, updatingPrices, fetchSignals]);

  const runAnalysis = useCallback(async (signalId?: string) => {
    if (!user?.id) return;
    
    // If analyzing a specific signal, check if it's already being analyzed
    if (signalId && (analyzing || analyzingSignalId)) return;
    // If analyzing all, check if any analysis is in progress
    if (!signalId && (analyzing || analyzingSignalId)) return;

    if (signalId) {
      setAnalyzingSignalId(signalId);
    } else {
      setAnalyzing(true);
    }

    try {
      const response = await fetch('/api/signals/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          signal_id: signalId || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh signals to get updated analysis data
        await fetchSignals();
        console.log(`Analyzed ${data.count || 0} signal(s)`);
      } else {
        console.error('Failed to analyze signals:', data.error);
      }
    } catch (error) {
      console.error('Error running analysis:', error);
    } finally {
      if (signalId) {
        setAnalyzingSignalId(null);
      } else {
        setAnalyzing(false);
      }
    }
  }, [user?.id, analyzing, analyzingSignalId, fetchSignals]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Update prices every 30 seconds for active signals
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      updatePrices();
    }, 30000); // 30 seconds

    // Initial update
    updatePrices();

    return () => clearInterval(interval);
  }, [user?.id, updatePrices]);

  // Run analysis every 5 minutes for active signals
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      runAnalysis();
    }, 5 * 60 * 1000); // 5 minutes

    // Initial analysis run
    runAnalysis();

    return () => clearInterval(interval);
  }, [user?.id, runAnalysis]);

  const handleStatusChange = async (signalId: string, newStatus: WatchlistSignal['status']) => {
    if (!user?.id) return;

    try {
      const response = await fetch('/api/signals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_id: signalId,
          user_id: user.id,
          status: newStatus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchSignals();
      } else {
        alert('Failed to update status: ' + data.error);
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleDelete = async (signalId: string) => {
    if (!user?.id) return;
    if (!confirm('Are you sure you want to remove this signal from your watchlist?')) return;

    try {
      const response = await fetch(`/api/signals?signal_id=${signalId}&user_id=${user.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        await fetchSignals();
      } else {
        alert('Failed to delete signal: ' + data.error);
      }
    } catch (error: any) {
      console.error('Error deleting signal:', error);
      alert('Error: ' + error.message);
    }
  };

  const filteredSignals = signals.filter(signal => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'closed') {
      return ['hit_sl', 'hit_tp', 'closed'].includes(signal.status);
    }
    return signal.status === activeFilter;
  });

  const getStatusColor = (status: WatchlistSignal['status']) => {
    switch (status) {
      case 'watching':
        return 'bg-gray-600';
      case 'signal_ready':
        return 'bg-yellow-600';
      case 'active':
        return 'bg-green-600';
      case 'hit_tp':
        return 'bg-blue-600';
      case 'hit_sl':
        return 'bg-red-600';
      case 'closed':
        return 'bg-gray-500';
      default:
        return 'bg-gray-600';
    }
  };

  const getPriceDistance = (currentPrice: number | null, targetPrice: number | null, direction: 'long' | 'short' | null) => {
    if (!currentPrice || !targetPrice || !direction) return null;
    
    if (direction === 'long') {
      return ((targetPrice - currentPrice) / currentPrice) * 100;
    } else {
      return ((currentPrice - targetPrice) / currentPrice) * 100;
    }
  };

  const isPriceNearLevel = (currentPrice: number | null, level: number | null, thresholdPercent: number = 0.5) => {
    if (!currentPrice || !level) return false;
    const distance = Math.abs((currentPrice - level) / level) * 100;
    return distance <= thresholdPercent;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading signals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">Trade Signals</h1>
          <div className="flex gap-2">
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              {analyzing ? 'Analyzing...' : 'Analyze Now'}
            </button>
            <button
              onClick={updatePrices}
              disabled={updatingPrices}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              {updatingPrices ? 'Updating...' : 'Update Prices'}
            </button>
            <Link
              href="/dashboard"
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'watching', label: 'Watching' },
            { key: 'signal_ready', label: 'Signal Ready' },
            { key: 'active', label: 'Active' },
            { key: 'closed', label: 'Closed' },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key as any)}
              className={`px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap ${
                activeFilter === filter.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Signals List */}
        {filteredSignals.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400 text-lg">
              {activeFilter === 'all'
                ? 'No signals in your watchlist yet. Add instruments from the analysis page.'
                : `No ${activeFilter} signals.`}
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSignals.map((signal) => {
              const analysisData = signal.analysis_data || {};
              const currentPrice = signal.current_price;
              const isActive = signal.status === 'active';
              const isWatching = signal.status === 'watching';
              const isSignalReady = signal.status === 'signal_ready';

              return (
                <div
                  key={signal.id}
                  className="bg-gray-800 rounded-lg p-4 sm:p-6 border-l-4 border-blue-500"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl sm:text-2xl font-bold">{signal.instrument}</h2>
                        <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(signal.status)}`}>
                          {signal.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        Added: {formatTimeWithTimezone(signal.added_at)}
                      </p>
                      {signal.last_analyzed_at ? (
                        <p className="text-sm text-gray-400">
                          Last Analyzed: <span className="text-blue-400 font-semibold">{formatTimeWithTimezone(signal.last_analyzed_at)}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">
                          Last Analyzed: Never
                        </p>
                      )}
                      {signal.signal_generated_at && (
                        <p className="text-sm text-gray-400">
                          Signal Generated: {formatTimeWithTimezone(signal.signal_generated_at)}
                        </p>
                      )}
                      {signal.trade_started_at && (
                        <p className="text-sm text-gray-400">
                          Trade Started: {formatTimeWithTimezone(signal.trade_started_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {!['hit_sl', 'hit_tp', 'closed'].includes(signal.status) && (
                        <button
                          onClick={() => runAnalysis(signal.id)}
                          disabled={analyzing || analyzingSignalId === signal.id}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                        >
                          {analyzingSignalId === signal.id ? 'Analyzing...' : 'Analyze Now'}
                        </button>
                      )}
                      {signal.analysis_run_id && (
                        <Link
                          href={`/analysis?run_id=${signal.analysis_run_id}`}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                        >
                          View Analysis
                        </Link>
                      )}
                      {!['hit_sl', 'hit_tp', 'closed'].includes(signal.status) && (
                        <button
                          onClick={() => handleDelete(signal.id)}
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Trade Levels */}
                  {signal.direction && (
                    <div className="bg-gray-700 rounded-lg p-4 mb-4">
                      <h3 className="text-lg font-semibold mb-3">
                        {signal.direction.toUpperCase()} Signal
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {currentPrice && (
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Current Price</p>
                            <p className="text-lg font-bold">
                              <ClickablePrice price={currentPrice} instrument={signal.instrument} className="text-lg font-bold" />
                            </p>
                            {signal.price_updated_at && (
                              <p className="text-xs text-gray-500 mt-1">
                                Updated: {formatTimeWithTimezone(signal.price_updated_at)}
                              </p>
                            )}
                          </div>
                        )}
                        {signal.entry_price && (
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Entry</p>
                            <p className={`text-lg font-bold ${isPriceNearLevel(currentPrice, signal.entry_price) ? 'text-yellow-400 animate-pulse' : ''}`}>
                              <ClickablePrice price={signal.entry_price} instrument={signal.instrument} className="text-lg font-bold" />
                            </p>
                            {currentPrice && signal.direction && (
                              <p className="text-xs text-gray-500 mt-1">
                                {getPriceDistance(currentPrice, signal.entry_price, signal.direction)?.toFixed(2)}%
                              </p>
                            )}
                          </div>
                        )}
                        {signal.stop_loss && (
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Stop Loss</p>
                            <p className={`text-lg font-bold ${isPriceNearLevel(currentPrice, signal.stop_loss, 0.3) ? 'text-red-400 animate-pulse' : 'text-red-400'}`}>
                              <ClickablePrice price={signal.stop_loss} instrument={signal.instrument} className="text-lg font-bold" />
                            </p>
                            {currentPrice && signal.direction && (
                              <p className="text-xs text-gray-500 mt-1">
                                {getPriceDistance(currentPrice, signal.stop_loss, signal.direction)?.toFixed(2)}%
                              </p>
                            )}
                          </div>
                        )}
                        {signal.take_profit && signal.take_profit.length > 0 && (
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Take Profit{signal.take_profit.length > 1 ? 's' : ''}</p>
                            <div className="space-y-1">
                              {signal.take_profit.map((tp, idx) => (
                                <div key={idx}>
                                  <p className={`text-lg font-bold ${isPriceNearLevel(currentPrice, tp, 0.3) ? 'text-green-400 animate-pulse' : 'text-green-400'}`}>
                                    <ClickablePrice price={tp} instrument={signal.instrument} className="text-lg font-bold" />
                                    {signal.take_profit && signal.take_profit.length > 1 && (
                                      <span className="text-sm text-gray-400 ml-2">TP{idx + 1}</span>
                                    )}
                                  </p>
                                  {currentPrice && signal.direction && (
                                    <p className="text-xs text-gray-500">
                                      {getPriceDistance(currentPrice, tp, signal.direction)?.toFixed(2)}%
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {isSignalReady && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatusChange(signal.id, 'active')}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                      >
                        Mark as Active
                      </button>
                    </div>
                  )}

                  {isActive && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatusChange(signal.id, 'closed')}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                      >
                        Mark as Closed
                      </button>
                    </div>
                  )}

                  {/* Exit Information */}
                  {signal.trade_closed_at && (
                    <div className="mt-4 bg-gray-700 rounded-lg p-4">
                      <p className="text-sm text-gray-400">Trade Closed</p>
                      <p className="text-lg font-semibold">
                        {signal.exit_price && (
                          <ClickablePrice price={signal.exit_price} instrument={signal.instrument} className="text-lg font-semibold" />
                        )}
                      </p>
                      <p className="text-sm text-gray-400">
                        Reason: {signal.exit_reason?.toUpperCase() || 'Manual'}
                      </p>
                      <p className="text-sm text-gray-400">
                        Closed: {formatTimeWithTimezone(signal.trade_closed_at)}
                      </p>
                    </div>
                  )}

                  {/* Analysis Summary */}
                  {analysisData.final_decision && (
                    <div className="mt-4 text-sm text-gray-400">
                      <p>
                        Decision: <span className="text-white font-semibold">{analysisData.final_decision}</span>
                      </p>
                      {analysisData.timeframe_2h?.bias && (
                        <p>
                          2H Bias: <span className="text-white">{analysisData.timeframe_2h.bias}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
