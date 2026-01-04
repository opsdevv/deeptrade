'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { formatTimeWithTimezone } from '@/lib/utils/price-format';

interface Instrument {
  symbol: string;
  display_name: string;
  category?: 'forex' | 'stock_indices' | 'commodities' | 'derived' | 'cryptocurrencies';
}

interface AnalysisRun {
  id: string;
  timestamp: string;
  status: string;
  signal_type: string;
  direction: string | null;
  confidence: string | null;
}

interface AnalysisHistory {
  [instrument: string]: AnalysisRun[];
}

type Category = 'all' | 'forex' | 'stock_indices' | 'commodities' | 'derived' | 'cryptocurrencies';

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [allInstruments, setAllInstruments] = useState<Instrument[]>([]);
  const [filteredInstruments, setFilteredInstruments] = useState<Instrument[]>([]);
  const [groupedInstruments, setGroupedInstruments] = useState<Record<string, Instrument[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistory>({});
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/dashboard');
    }
  }, [user, authLoading, router]);

  const applyFilters = (instruments: Instrument[], category: Category, query: string) => {
    let filtered = [...instruments];

    // Filter by category
    if (category && category !== 'all') {
      filtered = filtered.filter((inst) => inst.category === category);
    }

    // Filter by search query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (inst) =>
          inst.symbol.toLowerCase().includes(lowerQuery) ||
          inst.display_name.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredInstruments(filtered);
  };

  const fetchInstruments = async () => {
    try {
      const response = await fetch('/api/instruments');
      const data = await response.json();
      if (data.success) {
        setAllInstruments(data.instruments);
        if (data.grouped) {
          setGroupedInstruments(data.grouped);
        }
        // Apply initial filters
        applyFilters(data.instruments, selectedCategory, searchQuery);
      }
    } catch (error) {
      console.error('Error fetching instruments:', error);
    }
  };

  const fetchRecentRuns = async () => {
    try {
      const response = await fetch('/api/analysis/history');
      const data = await response.json();
      if (data.success && data.history) {
        setAnalysisHistory(data.history);
      }
    } catch (error) {
      console.error('Error fetching recent runs:', error);
    }
  };

  useEffect(() => {
    fetchInstruments();
    fetchRecentRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFilters(allInstruments, selectedCategory, searchQuery);
  }, [selectedCategory, searchQuery, allInstruments]);

  // Handle click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!selectedInstrument) {
      return;
    }
    if (loading) {
      return; // Prevent multiple simultaneous runs
    }

    setLoading(true);
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instrument: selectedInstrument,
        }),
      });

      // Check if response is ok and has content
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || 'Analysis failed');
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
      if (data.success) {
        // Refresh history after running analysis
        await fetchRecentRuns();
        // Redirect to analysis view
        window.location.href = `/analysis?run_id=${data.analysis_run_id}`;
      } else {
        alert('Analysis failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error running analysis:', error);
      alert('Error running analysis: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedInstrument, loading]);

  const deleteAnalysisRun = async (runId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this analysis run?')) {
      return;
    }

    setDeletingRunId(runId);
    try {
      const response = await fetch(`/api/analysis/delete?run_id=${runId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        // Refresh history
        await fetchRecentRuns();
      } else {
        alert('Failed to delete analysis run: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error deleting analysis run:', error);
      alert('Error deleting analysis run: ' + error.message);
    } finally {
      setDeletingRunId(null);
    }
  };

  const handleInstrumentSelect = (inst: Instrument) => {
    setSelectedInstrument(inst.symbol);
    setSearchQuery(`${inst.display_name} (${inst.symbol})`);
    setShowSearchResults(false);
    // Focus back on input for better UX
    searchInputRef.current?.blur();
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(true);
    // Clear selection if user is typing a new search
    if (selectedInstrument && !value.includes('(')) {
      setSelectedInstrument('');
    }
  };

  const handleCategoryChange = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedInstrument('');
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const selectedInstrumentData = allInstruments.find((i) => i.symbol === selectedInstrument);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 sm:mb-8">ICT Scalping Analysis</h1>

        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Run Analysis</h2>
          
          <div className="space-y-6">
            {/* Category Filter */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium">
                  Category
                </label>
                {allInstruments.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {allInstruments.length} total instruments
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'forex', 'stock_indices', 'commodities', 'derived', 'cryptocurrencies'] as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryChange(cat)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {cat === 'all' ? 'All' : cat.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Search Instrument */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2">
                Search Instrument
              </label>
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (blurTimeoutRef.current) {
                      clearTimeout(blurTimeoutRef.current);
                      blurTimeoutRef.current = null;
                    }
                    setShowSearchResults(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearchResults(false);
                      searchInputRef.current?.blur();
                    }
                  }}
                  placeholder="Type to search instruments..."
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-3 pl-11 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <svg
                  className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Search Results Dropdown */}
              {showSearchResults && filteredInstruments.length > 0 && (
                <div
                  ref={searchResultsRef}
                  className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-60 sm:max-h-80 overflow-y-auto"
                >
                  <div className="px-3 sm:px-4 py-2 text-xs text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-800">
                    {filteredInstruments.length} instrument{filteredInstruments.length !== 1 ? 's' : ''} found
                  </div>
                  <div className="py-1">
                    {filteredInstruments.slice(0, 50).map((inst) => (
                      <button
                        key={inst.symbol}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleInstrumentSelect(inst);
                        }}
                        className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-700 transition ${
                          selectedInstrument === inst.symbol ? 'bg-blue-600/30 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm sm:text-base truncate">{inst.display_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{inst.symbol}</p>
                          </div>
                          {inst.category && (
                            <span className="text-xs px-2 py-1 bg-gray-700 rounded ml-2 flex-shrink-0">
                              {inst.category.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredInstruments.length > 50 && (
                      <div className="px-3 sm:px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-700">
                        Showing first 50 results. Refine your search for more.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Results Message */}
              {showSearchResults && filteredInstruments.length === 0 && searchQuery.trim() && (
                <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-6 text-center">
                  <p className="text-gray-400 mb-1">No instruments found</p>
                  <p className="text-xs text-gray-500">Try a different search term or category</p>
                </div>
              )}
            </div>

            {/* Selected Instrument & Analyze Section */}
            {selectedInstrument && selectedInstrumentData && (
              <div className="mt-4 p-3 sm:p-4 bg-gradient-to-r from-blue-900/30 to-blue-800/20 border border-blue-600/30 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">Selected Instrument</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-white break-words">
                        {selectedInstrumentData.display_name}
                      </h3>
                      <span className="text-xs sm:text-sm text-gray-400">({selectedInstrument})</span>
                      {selectedInstrumentData.category && (
                        <span className="text-xs px-2 py-1 bg-blue-600/30 rounded">
                          {selectedInstrumentData.category.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  {loading && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-sm text-blue-400 font-medium">Analyzing...</span>
                    </div>
                  )}
                </div>
                {loading && (
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden mb-4">
                    <div className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 rounded-full animate-pulse" style={{
                      width: '100%',
                    }}></div>
                  </div>
                )}
                <button
                  onClick={runAnalysis}
                  disabled={loading}
                  className={`w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg font-semibold text-base sm:text-lg transition-all transform ${
                    loading
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/50'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="hidden sm:inline">Running Analysis...</span>
                      <span className="sm:hidden">Running...</span>
                    </span>
                  ) : (
                    'Run Analysis'
                  )}
                </button>
              </div>
            )}

            {/* Prompt to select instrument */}
            {!selectedInstrument && !loading && (
              <div className="mt-4 p-4 bg-gray-700/50 border border-gray-600 rounded-lg text-center">
                <p className="text-gray-400">
                  Search and select an instrument above to begin analysis
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Analysis Runs */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
            <h2 className="text-xl sm:text-2xl font-semibold">Recent Analysis Runs</h2>
            <button
              onClick={fetchRecentRuns}
              className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
          
          {Object.keys(analysisHistory).length === 0 ? (
            <p className="text-gray-400">No recent analysis runs</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(analysisHistory).map(([instrument, runs]) => (
                <div key={instrument} className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">{instrument}</h3>
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className="bg-gray-800 rounded p-3 hover:bg-gray-700 transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                          <Link
                            href={`/analysis?run_id=${run.id}`}
                            className="flex-1 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0"
                          >
                            <div className="flex-1">
                              <p className="text-xs sm:text-sm text-gray-400">
                                {formatTimeWithTimezone(run.timestamp)}
                              </p>
                              {run.direction && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {run.direction.toUpperCase()}
                                  {run.confidence && ` • ${run.confidence.toUpperCase()} confidence`}
                                </p>
                              )}
                            </div>
                            <div className="text-left sm:text-right">
                              <span
                                className={`inline-block px-3 py-1 rounded text-xs sm:text-sm ${
                                  run.signal_type === 'TRADE_SETUP'
                                    ? 'bg-green-600'
                                    : run.signal_type === 'WATCH'
                                    ? 'bg-yellow-600'
                                    : 'bg-gray-600'
                                }`}
                              >
                                {run.signal_type || run.status}
                              </span>
                            </div>
                          </Link>
                          <button
                            onClick={(e) => deleteAnalysisRun(run.id, e)}
                            disabled={deletingRunId === run.id}
                            className="self-start sm:self-center sm:ml-3 text-red-400 hover:text-red-300 disabled:opacity-50 transition"
                            title="Delete analysis run"
                          >
                            {deletingRunId === run.id ? (
                              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
