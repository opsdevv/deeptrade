'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PriceDataView from '@/components/analysis/PriceDataView';
import DeepSeekChat from '@/components/analysis/DeepSeekChat';
import ClickablePrice from '@/components/ui/ClickablePrice';
import { AnalysisResult, TimeframeData, ChartDrawingData } from '@/types/analysis';
import { formatPrice, formatPriceRange, formatPriceArray } from '@/lib/utils/price-format';
import { detectSupportResistance, SupportResistanceLevel } from '@/lib/ict/support-resistance';
import { useAuth } from '@/lib/auth/context';

// JSON Viewer Component
function JSONViewer({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']));
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const renderValue = (value: any, key: string, path: string): JSX.Element => {
    if (value === null) {
      return <span className="text-gray-500">null</span>;
    }
    if (value === undefined) {
      return <span className="text-gray-500">undefined</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="text-purple-400">{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span className="text-blue-400">{value}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-green-400">"{value}"</span>;
    }
    if (Array.isArray(value)) {
      const isExpanded = expanded.has(path);
      return (
        <div>
          <button
            onClick={() => toggleExpand(path)}
            className="text-gray-400 hover:text-white mr-2"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span className="text-gray-400">[</span>
          <span className="text-gray-500 ml-2">array({value.length})</span>
          {isExpanded && (
            <div className="ml-6 mt-1">
              {value.map((item, index) => (
                <div key={index} className="mb-1">
                  {renderValue(item, `${key}[${index}]`, `${path}[${index}]`)}
                </div>
              ))}
            </div>
          )}
          <span className="text-gray-400">]</span>
        </div>
      );
    }
    if (typeof value === 'object') {
      const isExpanded = expanded.has(path);
      const keys = Object.keys(value);
      return (
        <div>
          <button
            onClick={() => toggleExpand(path)}
            className="text-gray-400 hover:text-white mr-2"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span className="text-gray-400">{'{'}</span>
          <span className="text-gray-500 ml-2">{keys.length} keys</span>
          {isExpanded && (
            <div className="ml-6 mt-1">
              {keys.map((k) => (
                <div key={k} className="mb-1">
                  <span className="text-yellow-400">"{k}"</span>
                  <span className="text-gray-400">: </span>
                  {renderValue(value[k], k, `${path}.${k}`)}
                </div>
              ))}
            </div>
          )}
          <span className="text-gray-400">{'}'}</span>
        </div>
      );
    }
    return <span>{String(value)}</span>;
  };

  if (viewMode === 'raw') {
    return (
      <div>
        <div className="mb-2 flex gap-2">
          <button
            onClick={() => setViewMode('tree')}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
          >
            Tree View
          </button>
        </div>
        <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => setViewMode('raw')}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        >
          Raw JSON
        </button>
        <button
          onClick={() => {
            const allPaths = new Set<string>();
            const collectPaths = (obj: any, path: string) => {
              allPaths.add(path);
              if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                Object.keys(obj).forEach((key) => {
                  collectPaths(obj[key], `${path}.${key}`);
                });
              } else if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                  collectPaths(item, `${path}[${index}]`);
                });
              }
            };
            collectPaths(data, 'root');
            setExpanded(allPaths);
          }}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        >
          Expand All
        </button>
        <button
          onClick={() => setExpanded(new Set(['root']))}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        >
          Collapse All
        </button>
      </div>
      <div className="bg-gray-900 p-4 rounded overflow-auto text-sm max-h-96 font-mono">
        {renderValue(data, 'root', 'root')}
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('run_id');
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, TimeframeData[]>>({});
  const [drawingData, setDrawingData] = useState<ChartDrawingData | null>(null);
  const [supportResistance, setSupportResistance] = useState<Record<string, SupportResistanceLevel[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState<'2h' | '15m' | '5m'>('2h');
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [watchlistStatus, setWatchlistStatus] = useState<'idle' | 'added' | 'updated'>('idle');

  // Disable scroll restoration on mount
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (runId) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:175',message:'runId changed, scrolling to top and fetching analysis',data:{runId,scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Scroll to top when navigating to a new analysis
      window.scrollTo(0, 0);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:179',message:'After scrollTo, scroll position',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      fetchAnalysis(runId);
    }
  }, [runId]);

  // Scroll to top when analysis finishes loading
  useEffect(() => {
    if (!loading && analysis) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:187',message:'Analysis loaded, preparing to scroll to top',data:{loading,hasAnalysis:!!analysis,scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Use requestAnimationFrame to ensure scroll happens after render
      requestAnimationFrame(() => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:192',message:'In requestAnimationFrame, before scrollTo',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        window.scrollTo(0, 0);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:196',message:'After scrollTo in RAF',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      });
    }
  }, [loading, analysis]);

  // Also scroll to top when chartData finishes loading (content might change height)
  useEffect(() => {
    if (Object.keys(chartData).length > 0 && !loading && analysis) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:207',message:'ChartData loaded, scrolling to top',data:{scrollY:window.scrollY,chartDataKeys:Object.keys(chartData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:211',message:'After scrollTo in chartData effect',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
      });
    }
  }, [chartData, loading, analysis]);

  // Track scroll events to see what's causing unwanted scrolling
  useEffect(() => {
    const handleScroll = () => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:205',message:'Scroll event detected',data:{scrollY:window.scrollY,scrollX:window.scrollX},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchAnalysis = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analysis?run_id=${id}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || 'Failed to fetch analysis');
      }

      const responseText = await response.text();
      if (!responseText) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', responseText);
        throw new Error('Invalid response format from server');
      }
      
      if (data.success && data.result) {
        setAnalysis(data.result);
        prepareChartData(data.result);
        
        // Fetch chart data for visualization
        // We'll fetch it from the data API using the instrument
        try {
          const dataResponse = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instrument: data.result.instrument,
              timeframes: ['2h', '15m', '5m'],
            }),
          });
          
          if (dataResponse.ok) {
            const dataResult = await dataResponse.json();
            if (dataResult.success && dataResult.data) {
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:240',message:'Setting chartData, scroll position before',data:{scrollY:window.scrollY,hasData:!!dataResult.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              setChartData(dataResult.data);
              calculateSupportResistance(dataResult.data);
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:244',message:'After setting chartData, scroll position',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            }
          }
        } catch (dataError) {
          console.warn('Could not fetch chart data:', dataError);
          // Continue without chart data - charts just won't show
        }
      } else {
        throw new Error(data.error || 'Analysis not found');
      }
    } catch (error: any) {
      console.error('Error fetching analysis:', error);
      alert('Error loading analysis: ' + error.message);
    } finally {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:257',message:'Setting loading to false',data:{scrollY:window.scrollY,hasAnalysis:!!analysis},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setLoading(false);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/analysis/page.tsx:260',message:'After setLoading false, scroll position',data:{scrollY:window.scrollY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    }
  };

  const prepareChartData = (result: AnalysisResult) => {
    // Prepare drawing data from analysis result
    const drawings: ChartDrawingData = {
      fvgs: [
        ...result.timeframe_2h.fvgs,
        ...result.timeframe_15m.fvgs,
        ...(result.timeframe_5m.fvg_details ? [result.timeframe_5m.fvg_details] : []),
      ],
      liquidity: result.timeframe_2h.key_liquidity,
      order_blocks: result.timeframe_2h.order_blocks,
      premium_discount: {
        range_high: result.timeframe_2h.range_high,
        range_low: result.timeframe_2h.range_low,
        current: result.timeframe_2h.premium_discount,
        pd_level: result.timeframe_2h.pd_level,
      },
      trade_levels: {
        entry: result.timeframe_5m.entry_price,
        stop: result.timeframe_5m.stop_price,
        target: result.timeframe_5m.target_price,
      },
      mss_points: [],
      displacement: result.timeframe_15m.displacement,
      session_markers: [],
    };

    setDrawingData(drawings);
  };

  // Get drawing data filtered by timeframe
  const getDrawingDataForTimeframe = (timeframe: '2h' | '15m' | '5m'): ChartDrawingData | null => {
    if (!analysis || !drawingData) return null;

    const filtered: ChartDrawingData = {
      fvgs: [],
      liquidity: { buy_side: [], sell_side: [] },
      order_blocks: [],
      premium_discount: {
        range_high: 0,
        range_low: 0,
        current: 'premium' as const,
        pd_level: 0,
      },
      trade_levels: { entry: null, stop: null, target: null },
      mss_points: [],
      displacement: [],
      session_markers: [],
    };

    if (timeframe === '2h') {
      filtered.fvgs = analysis.timeframe_2h.fvgs || [];
      filtered.liquidity = analysis.timeframe_2h.key_liquidity || { buy_side: [], sell_side: [] };
      filtered.order_blocks = analysis.timeframe_2h.order_blocks || [];
      filtered.premium_discount = {
        range_high: analysis.timeframe_2h.range_high || 0,
        range_low: analysis.timeframe_2h.range_low || 0,
        current: analysis.timeframe_2h.premium_discount || 'premium',
        pd_level: analysis.timeframe_2h.pd_level || 0,
      };
    } else if (timeframe === '15m') {
      filtered.fvgs = analysis.timeframe_15m.fvgs || [];
      filtered.displacement = analysis.timeframe_15m.displacement || [];
    } else if (timeframe === '5m') {
      filtered.fvgs = analysis.timeframe_5m.fvg_details ? [analysis.timeframe_5m.fvg_details] : [];
      filtered.trade_levels = {
        entry: analysis.timeframe_5m.entry_price || null,
        stop: analysis.timeframe_5m.stop_price || null,
        target: analysis.timeframe_5m.target_price || null,
      };
    }

    return filtered;
  };

  const calculateSupportResistance = (rawData: Record<string, TimeframeData[]>) => {
    // Calculate support/resistance from chart data
    const levels: Record<string, SupportResistanceLevel[]> = {};
    
    Object.entries(rawData).forEach(([tf, data]) => {
      if (data && data.length > 0) {
        const timeframe = tf as '2h' | '15m' | '5m';
        levels[tf] = detectSupportResistance(data, timeframe);
      }
    });

    setSupportResistance(levels);
  };

  const refreshAnalysis = async () => {
    if (!analysis) return;

    setRefreshing(true);
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instrument: analysis.instrument,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || 'Failed to refresh analysis');
      }

      const responseText = await response.text();
      if (!responseText) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', responseText);
        throw new Error('Invalid response format from server');
      }

      if (data.success && data.analysis_run_id) {
        // Redirect to the new analysis run
        window.location.href = `/analysis?run_id=${data.analysis_run_id}`;
      } else {
        // Check if there are missing timeframes
        if (data.missingTimeframes && Array.isArray(data.missingTimeframes)) {
          throw new Error(
            `Unable to refresh analysis: No data available for ${data.missingTimeframes.join(', ')} timeframe(s). The market data service may be temporarily unavailable. Please try again in a few moments.`
          );
        }
        throw new Error(data.error || 'Failed to refresh analysis');
      }
    } catch (error: any) {
      console.error('Error refreshing analysis:', error);
      alert('Error refreshing analysis: ' + error.message);
    } finally {
      setRefreshing(false);
    }
  };

  const addToWatchlist = async () => {
    if (!analysis || !user?.id) {
      alert('Please log in to add instruments to your watchlist');
      return;
    }

    setAddingToWatchlist(true);
    try {
      const response = await fetch('/api/signals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          instrument: analysis.instrument,
          analysis_run_id: runId || null,
          analysis_data: analysis,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setWatchlistStatus(data.isNew ? 'added' : 'updated');
        setTimeout(() => setWatchlistStatus('idle'), 3000);
      } else {
        alert('Failed to add to watchlist: ' + data.error);
      }
    } catch (error: any) {
      console.error('Error adding to watchlist:', error);
      alert('Error: ' + error.message);
    } finally {
      setAddingToWatchlist(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading analysis...</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Analysis not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
            Analysis: {analysis.instrument}
          </h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={refreshAnalysis}
              disabled={refreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition text-sm w-full sm:w-auto"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Analysis'}
            </button>
            {user && (
              <button
                onClick={addToWatchlist}
                disabled={addingToWatchlist}
                className={`font-semibold py-2 px-4 rounded-lg transition text-sm w-full sm:w-auto ${
                  watchlistStatus === 'added'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : watchlistStatus === 'updated'
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
                }`}
              >
                {addingToWatchlist
                  ? 'Adding...'
                  : watchlistStatus === 'added'
                  ? '✓ Added to Watchlist'
                  : watchlistStatus === 'updated'
                  ? '✓ Updated in Watchlist'
                  : 'Add to Watchlist'}
              </button>
            )}
            <Link
              href="/dashboard"
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition text-sm text-center w-full sm:w-auto"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <div
            className={`inline-block px-4 py-2 rounded-lg font-semibold ${
              analysis.final_decision === 'TRADE_SETUP'
                ? 'bg-green-600'
                : analysis.final_decision === 'WATCH'
                ? 'bg-yellow-600'
                : 'bg-gray-600'
            }`}
          >
            {analysis.final_decision}
          </div>
        </div>

        {/* Timeframe Analysis Sections */}
        <div className="space-y-8 mb-8">
          {/* 2H Analysis */}
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">2H Bias Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400">Bias</p>
                <p className="text-xl font-semibold">{analysis.timeframe_2h.bias}</p>
              </div>
              <div>
                <p className="text-gray-400">Premium/Discount</p>
                <p className="text-xl font-semibold">
                  {analysis.timeframe_2h.premium_discount}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PD Level: <ClickablePrice price={analysis.timeframe_2h.pd_level} instrument={analysis.instrument} className="text-gray-500" />
                </p>
              </div>
              <div>
                <p className="text-gray-400">Range</p>
                <p className="text-sm">
                  <ClickablePrice price={analysis.timeframe_2h.range_low} instrument={analysis.instrument} className="text-sm" /> - <ClickablePrice price={analysis.timeframe_2h.range_high} instrument={analysis.instrument} className="text-sm" />
                </p>
              </div>
              <div>
                <p className="text-gray-400">FVGs</p>
                <p className="text-sm">{analysis.timeframe_2h.fvgs.length} detected</p>
              </div>
              <div>
                <p className="text-gray-400">Liquidity Pools</p>
                <p className="text-xs">
                  Buy: {analysis.timeframe_2h.key_liquidity.buy_side.length > 0 ? (
                    analysis.timeframe_2h.key_liquidity.buy_side.map((price, idx) => (
                      <span key={idx}>
                        <ClickablePrice price={price} instrument={analysis.instrument} className="text-xs" />
                        {idx < analysis.timeframe_2h.key_liquidity.buy_side.length - 1 && ', '}
                      </span>
                    ))
                  ) : 'None'}
                </p>
                <p className="text-xs">
                  Sell: {analysis.timeframe_2h.key_liquidity.sell_side.length > 0 ? (
                    analysis.timeframe_2h.key_liquidity.sell_side.map((price, idx) => (
                      <span key={idx}>
                        <ClickablePrice price={price} instrument={analysis.instrument} className="text-xs" />
                        {idx < analysis.timeframe_2h.key_liquidity.sell_side.length - 1 && ', '}
                      </span>
                    ))
                  ) : 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* 15m Analysis */}
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">15m Liquidity Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400">Liquidity Taken</p>
                <p className="text-xl font-semibold">
                  {analysis.timeframe_15m.liquidity_taken ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Setup Valid</p>
                <p className="text-xl font-semibold">
                  {analysis.timeframe_15m.setup_valid ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
          </div>

          {/* 5m Analysis */}
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">5m Execution Signal</h2>
            {analysis.timeframe_5m.trade_signal ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400">Direction</p>
                  <p className="text-xl font-semibold">
                    {analysis.timeframe_5m.direction?.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Confidence</p>
                  <p className="text-xl font-semibold">
                    {analysis.timeframe_5m.confidence}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Entry</p>
                  <p className="text-sm">
                    <ClickablePrice price={analysis.timeframe_5m.entry_price} instrument={analysis.instrument} className="text-sm" />
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Stop</p>
                  <p className="text-sm">
                    <ClickablePrice price={analysis.timeframe_5m.stop_price} instrument={analysis.instrument} className="text-sm" />
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Target</p>
                  <p className="text-sm">
                    <ClickablePrice price={analysis.timeframe_5m.target_price} instrument={analysis.instrument} className="text-sm" />
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Risk/Reward</p>
                  <p className="text-sm">
                    {analysis.timeframe_5m.risk_reward_ratio
                      ? analysis.timeframe_5m.risk_reward_ratio.toFixed(2)
                      : 'N/A'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">No trade signal</p>
            )}
          </div>
        </div>

        {/* Support & Resistance Section */}
        {Object.keys(supportResistance).length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">Support & Resistance Levels</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {Object.entries(supportResistance).map(([tf, levels]) => (
                <div key={tf} className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">{tf.toUpperCase()} Timeframe</h3>
                  <div className="space-y-2">
                    {levels.slice(0, 5).map((level, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded ${
                          level.type === 'support'
                            ? 'bg-green-900/30 border-l-4 border-green-500'
                            : 'bg-red-900/30 border-l-4 border-red-500'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            {level.type === 'support' ? 'Support' : 'Resistance'}
                          </span>
                          <span className="text-sm text-gray-400">
                            <ClickablePrice price={level.price} instrument={analysis.instrument} className="text-sm text-gray-400" />
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-400">
                            {level.touches} touch{level.touches !== 1 ? 'es' : ''}
                          </span>
                          <span className="text-xs text-gray-400">
                            Strength: {(level.strength * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                    {levels.length === 0 && (
                      <p className="text-gray-400 text-sm">No significant levels detected</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price Data Section */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4">Price Data & ICT Analysis</h2>
          
          {/* Timeframe Tabs */}
          <div className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto">
            {(['2h', '15m', '5m'] as const).map((tf) => {
              const tfLabel = tf === '2h' ? '2H' : tf === '15m' ? '15M' : '5M';
              const isActive = activeTimeframe === tf;
              const hasData = chartData[tf] && chartData[tf].length > 0;
              
              return (
                <button
                  key={tf}
                  onClick={() => {
                    if (hasData) {
                      setActiveTimeframe(tf);
                    }
                  }}
                  className={`px-4 sm:px-6 py-2 sm:py-3 font-semibold transition-all duration-200 relative whitespace-nowrap ${
                    isActive
                      ? 'text-blue-400 bg-gray-700'
                      : 'text-gray-400 hover:text-gray-300'
                  } ${!hasData ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  disabled={!hasData}
                >
                  {tfLabel}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Timeframe Content */}
          {chartData[activeTimeframe] && chartData[activeTimeframe].length > 0 ? (
            <div className="bg-gray-900 rounded-lg p-4">
              <PriceDataView 
                data={chartData[activeTimeframe]} 
                timeframe={activeTimeframe} 
                instrument={analysis.instrument}
                drawingData={getDrawingDataForTimeframe(activeTimeframe)}
                supportResistance={supportResistance[activeTimeframe] || []}
              />
            </div>
          ) : (
            <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-400">
              <p>No data available for {activeTimeframe.toUpperCase()} timeframe</p>
            </div>
          )}
        </div>

        {/* DeepSeek AI Chat */}
        {runId && (
          <div className="mt-8">
            <DeepSeekChat runId={runId} analysisData={analysis} />
          </div>
        )}

        {/* JSON Viewer */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mt-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
            <h2 className="text-xl sm:text-2xl font-semibold">Raw Analysis Data</h2>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
                alert('Copied to clipboard!');
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm w-full sm:w-auto"
            >
              Copy JSON
            </button>
          </div>
          <JSONViewer data={analysis} />
        </div>
      </div>
    </div>
  );
}

