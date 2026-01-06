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
  setup_data?: {
    executed_via_websocket?: boolean;
    executed_at?: string;
    type?: string;
    entryZone?: string;
    stopLoss?: string;
    target?: string;
    trigger?: string;
    [key: string]: any;
  };
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

interface AutotradingSession {
  id: string;
  instrument: string;
  accountId: string;
  lotSize: number;
  numberOfPositions: number;
  timeframe: string;
  analysisStatus: AnalysisStatus;
  currentPrice: number | null;
  entryZoneReached: boolean;
  startedAt: string;
  analysisIntervalId?: NodeJS.Timeout | null;
  tickSubscription?: (() => void) | null;
}

export default function SmartTradePage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [derivApiAccounts, setDerivApiAccounts] = useState<DerivApiAccount[]>([]);
  const [selectedDerivAccount, setSelectedDerivAccount] = useState<DerivApiAccount | null>(null);
  const selectedAccountIdRef = useRef<string | null>(null); // Persist selected account ID across reloads
  const [loadingDerivAccounts, setLoadingDerivAccounts] = useState(false);
  const [derivAccountsError, setDerivAccountsError] = useState<string | null>(null);
  
  const STORAGE_KEY = 'smart-trade-selected-account-id'; // localStorage key for selected account
  const AUTOTRADING_SESSIONS_KEY = 'smart-trade-autotrading-sessions'; // localStorage key for autotrading sessions
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'all' | 'history' | 'setups' | 'automatic'>('active');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [editingTrade, setEditingTrade] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    entry_price: '',
    stop_loss: '',
    target_price: '',
    lot_size: '',
    number_of_positions: '',
  });
  const [closing, setClosing] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [autotradingSessions, setAutotradingSessions] = useState<AutotradingSession[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [lotSize, setLotSize] = useState<number>(1); // Minimum lot size (stake amount) for Deriv contracts
  const [numberOfPositions, setNumberOfPositions] = useState<number>(1);
  const [timeframe, setTimeframe] = useState<string>('2m');
  
  // Refs to track intervals and subscriptions per session
  const sessionIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const sessionSubscriptionsRef = useRef<Map<string, (() => void)>>(new Map());

  // Save sessions to localStorage
  const saveSessionsToStorage = (sessions: AutotradingSession[]) => {
    if (typeof window !== 'undefined') {
      // Remove non-serializable properties before saving
      const serializableSessions = sessions.map(session => ({
        ...session,
        analysisIntervalId: undefined,
        tickSubscription: undefined,
      }));
      localStorage.setItem(AUTOTRADING_SESSIONS_KEY, JSON.stringify(serializableSessions));
    }
  };

  // Load sessions from localStorage
  const loadSessionsFromStorage = (): AutotradingSession[] => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(AUTOTRADING_SESSIONS_KEY);
      if (stored) {
        try {
          const sessions = JSON.parse(stored);
          // #region agent log
          sessions.forEach((s: AutotradingSession) => {
            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:147',message:'Loaded session from localStorage',data:{sessionId:s.id,hasEntryPrice:!!s.analysisStatus?.entryPrice,hasTargetPrice:!!s.analysisStatus?.targetPrice,hasStopLoss:!!s.analysisStatus?.stopLoss,entryPrice:s.analysisStatus?.entryPrice,targetPrice:s.analysisStatus?.targetPrice,stopLoss:s.analysisStatus?.stopLoss,direction:s.analysisStatus?.direction,setupFound:s.analysisStatus?.setupFound},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          });
          // #endregion
          return sessions;
        } catch (e) {
          console.error('Error loading sessions from storage:', e);
        }
      }
    }
    return [];
  };

  useEffect(() => {
    // Load saved account selection from localStorage
    if (typeof window !== 'undefined') {
      const savedAccountId = localStorage.getItem(STORAGE_KEY);
      if (savedAccountId) {
        selectedAccountIdRef.current = savedAccountId;
      }
    }
    
    loadAccounts();
    // Don't load trades here - wait for account to be selected
    loadInstruments();
    
    // Load autotrading sessions from localStorage
    const savedSessions = loadSessionsFromStorage();
    if (savedSessions.length > 0) {
      setAutotradingSessions(savedSessions);
      // Restart analysis for each session
      savedSessions.forEach(session => {
        if (session.instrument && session.accountId) {
          // Find the account
          loadAccounts().then(() => {
            // Account will be loaded, then we'll restart the session
          });
        }
      });
    }
    
    // Set up interval to refresh trades every 5 seconds (silent refresh, no loading spinner)
    const interval = setInterval(() => {
      loadTrades(false); // Silent refresh - don't show loading spinner
    }, 5000);

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
      // Clean up all session intervals and subscriptions
      sessionIntervalsRef.current.forEach(interval => clearInterval(interval));
      sessionSubscriptionsRef.current.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Check for chat setup data and create autotrading session (only once)
  const chatSetupProcessedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || chatSetupProcessedRef.current) return;
    
    const chatSetupDataStr = localStorage.getItem('chat-autotrading-setup');
    if (!chatSetupDataStr) return;
    
    try {
      const chatSetupData = JSON.parse(chatSetupDataStr);
      
      // Check if data is recent (within last 5 minutes)
      const dataAge = Date.now() - (chatSetupData.timestamp || 0);
      if (dataAge > 5 * 60 * 1000) {
        // Data is too old, remove it
        localStorage.removeItem('chat-autotrading-setup');
        return;
      }
      
      // Wait for accounts to be loaded
      if (derivApiAccounts.length === 0 || !selectedDerivAccount) {
        return; // Will retry when accounts are loaded
      }
      
      chatSetupProcessedRef.current = true;
      
      // Remove the setup data from localStorage so it's only processed once
      localStorage.removeItem('chat-autotrading-setup');
      
      // Parse setup data to extract prices
      const parsePrice = (str: string): number | null => {
        if (!str || str === '-') return null;
        // Handle ranges like "248,700 - 248,800" by taking the first value
        // Remove commas and extract first number
        const cleaned = str.replace(/,/g, '');
        const match = cleaned.match(/([0-9.]+)/);
        return match ? parseFloat(match[1]) : null;
      };
      
      // Use the first setup (or combine them if multiple)
      const setup = chatSetupData.setups[0];
      if (!setup) return;
      
      // Parse entry zone - could be a range like "248,700 - 248,800"
      // For bullish, use the lower end; for bearish, use the higher end
      const entryZoneStr = setup.entryZone || setup.price;
      let entryPrice = parsePrice(entryZoneStr);
      
      // If entry zone is a range, extract both values and use appropriate one
      if (entryZoneStr && entryZoneStr.includes('-')) {
        const rangeMatch = entryZoneStr.replace(/,/g, '').match(/([0-9.]+)\s*-\s*([0-9.]+)/);
        if (rangeMatch) {
          const lower = parseFloat(rangeMatch[1]);
          const higher = parseFloat(rangeMatch[2]);
          // For bullish, use lower end of range; for bearish, use higher end
          entryPrice = setup.type === 'bullish' ? lower : higher;
        }
      }
      
      const stopLoss = parsePrice(setup.stopLoss);
      const targetPrice = parsePrice(setup.target);
      const direction = setup.type === 'bullish' ? 'long' : 'short';
      
      // Create autotrading session with setup pre-populated (skip analysis)
      const newSession: AutotradingSession = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        instrument: chatSetupData.symbol,
        accountId: selectedDerivAccount.account_id,
        lotSize: chatSetupData.lot_size,
        numberOfPositions: chatSetupData.number_of_positions,
        timeframe: '2m', // Default timeframe
        analysisStatus: {
          analyzing: false,
          setupFound: true, // Already analyzed in chat
          conditions: [
            { id: '1', label: 'Price action aligned with bias', met: true },
            { id: '2', label: 'Liquidity sweep confirmed', met: true },
            { id: '3', label: 'FVG present', met: true },
            { id: '4', label: 'Entry zone reached', met: false }, // Will be checked in real-time
            { id: '5', label: 'Confirmation signal', met: false }, // Will be checked in real-time
          ],
          entryPrice: entryPrice ?? undefined,
          stopLoss: stopLoss ?? undefined,
          targetPrice: targetPrice ?? undefined,
          direction,
          timeframe: '2m',
        },
        currentPrice: null,
        entryZoneReached: false,
        startedAt: new Date().toISOString(),
      };
      
      setAutotradingSessions(prev => {
        const updated = [...prev, newSession];
        saveSessionsToStorage(updated);
        return updated;
      });
      
      // Start real-time monitoring immediately (skip analysis)
      if (entryPrice && direction) {
        setTimeout(() => {
          startRealTimeMonitoringForSession(
            newSession.id,
            chatSetupData.symbol,
            entryPrice,
            direction,
            stopLoss || undefined,
            targetPrice || undefined
          );
        }, 500);
      }
    } catch (error) {
      console.error('Error processing chat setup data:', error);
      localStorage.removeItem('chat-autotrading-setup');
    }
  }, [derivApiAccounts.length, selectedDerivAccount]);

  // Restart sessions when accounts are loaded (only once)
  const sessionsRestartedRef = useRef(false);
  useEffect(() => {
    if (derivApiAccounts.length > 0 && autotradingSessions.length > 0 && !sessionsRestartedRef.current) {
      sessionsRestartedRef.current = true;
      autotradingSessions.forEach(session => {
        const account = derivApiAccounts.find(acc => acc.account_id === session.accountId);
        if (account && session.instrument) {
          // Only restart analysis if session doesn't already have setup (not from chat)
          if (!session.analysisStatus.setupFound) {
            setTimeout(() => {
              startSessionAnalysis(session.id);
            }, 500);
          } else {
            // Session from chat - just restart monitoring if we have entry price
            if (session.analysisStatus.entryPrice && session.analysisStatus.direction) {
              setTimeout(() => {
                startRealTimeMonitoringForSession(
                  session.id,
                  session.instrument,
                  session.analysisStatus.entryPrice!,
                  session.analysisStatus.direction!,
                  session.analysisStatus.stopLoss || undefined,
                  session.analysisStatus.targetPrice || undefined
                );
              }, 500);
            }
          }
        }
      });
    }
  }, [derivApiAccounts.length, autotradingSessions.length]);

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
        
        // Use ref or localStorage to preserve selected account across reloads
        const savedAccountId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const accountIdToSelect = selectedAccountIdRef.current || savedAccountId || selectedDerivAccount?.account_id;
        
        if (accountIdToSelect) {
          // Find and set the selected account by ID
          const accountToSelect = data.accounts.find(
            (acc: DerivApiAccount) => acc.account_id === accountIdToSelect
          );
          if (accountToSelect) {
            setSelectedDerivAccount(accountToSelect);
            selectedAccountIdRef.current = accountIdToSelect; // Update ref
            // Save to localStorage for persistence across page reloads
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY, accountIdToSelect);
            }
          } else if (data.accounts.length > 0) {
            // Selected account not found, fall back to first account
            setSelectedDerivAccount(data.accounts[0]);
            selectedAccountIdRef.current = data.accounts[0].account_id;
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY, data.accounts[0].account_id);
            }
          }
        } else if (data.accounts.length > 0) {
          // No account selected yet, select first one
          setSelectedDerivAccount(data.accounts[0]);
          selectedAccountIdRef.current = data.accounts[0].account_id;
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, data.accounts[0].account_id);
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
      // Load trades after accounts are loaded (will use selected account if available)
      // This ensures trades are loaded with the correct account filter
      // If no account is selected, it will load all trades for the user
      loadTrades(true);
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

  const loadTrades = async (showLoading = false) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:240',message:'loadTrades called',data:{activeTab,showLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (showLoading) {
        setLoading(true);
      }
      const status = activeTab === 'all' ? 'all' : activeTab === 'history' ? 'all' : activeTab === 'automatic' ? 'all' : activeTab;
      // Build URL with account_id if selected
      let url = `/api/trades?status=${status}`;
      if (selectedDerivAccount?.account_id) {
        url += `&account_id=${encodeURIComponent(selectedDerivAccount.account_id)}`;
      }
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:260',message:'Fetching trades with status and account',data:{status,activeTab,selectedAccountId:selectedDerivAccount?.account_id,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
      // #endregion
      const response = await fetch(url);
      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:252',message:'Trades loaded from API',data:{success:data.success,tradesCount:data.trades?.length||0,statuses:data.trades?.map((t:Trade)=>t.status)||[],pnlValues:data.trades?.map((t:Trade)=>({id:t.id,status:t.status,pnl:t.pnl,pnlPercentage:t.pnl_percentage}))||[],firstTradePnl:data.trades?.[0]?.pnl,firstTradePnlPercentage:data.trades?.[0]?.pnl_percentage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      if (data.success) {
        setTrades(data.trades || []);
        // Calculate total PNL - backend already filtered by account, so sum all returned trades
        const total = (data.trades || []).reduce((sum: number, trade: Trade) => sum + (trade.pnl || 0), 0);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:268',message:'Calculated total PNL for selected account',data:{selectedAccountId:selectedDerivAccount?.account_id,totalTrades:data.trades?.length||0,totalPnl:total,tradesWithPnl:data.trades?.filter((t:Trade)=>t.pnl!==0&&t.pnl!==null).length||0,pnlValues:data.trades?.map((t:Trade)=>({id:t.id,pnl:t.pnl}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        setTotalPnl(total);
      }
    } catch (error) {
      console.error('Error loading trades:', error);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:254',message:'Error loading trades',data:{error:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Load trades when tab changes
  useEffect(() => {
    // Load trades when tab changes - account filter will be applied if account is selected
    loadTrades(true);
  }, [activeTab]);

  // Reload trades when selected account changes (but not on initial mount to avoid double loading)
  const hasLoadedTradesRef = useRef(false);
  useEffect(() => {
    if (selectedDerivAccount && hasLoadedTradesRef.current) {
      // Account changed after initial load, reload trades with new account filter
      loadTrades(true);
    } else if (selectedDerivAccount) {
      // First time account is set, mark as loaded
      hasLoadedTradesRef.current = true;
    }
  }, [selectedDerivAccount?.account_id]);

  const startSessionAnalysis = (sessionId: string) => {
    const session = autotradingSessions.find(s => s.id === sessionId);
    if (!session) return;

    // Clear existing interval for this session
    const existingInterval = sessionIntervalsRef.current.get(sessionId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Start analyzing immediately
    analyzeAndFindSetupForSession(sessionId);
    
    // Then analyze every 2 minutes (120 seconds)
    const interval = setInterval(() => {
      analyzeAndFindSetupForSession(sessionId);
    }, 120000);
    
    sessionIntervalsRef.current.set(sessionId, interval);
  };

  const stopSessionAnalysis = (sessionId: string) => {
    // Clear interval
    const interval = sessionIntervalsRef.current.get(sessionId);
    if (interval) {
      clearInterval(interval);
      sessionIntervalsRef.current.delete(sessionId);
    }

    // Stop real-time monitoring
    const unsubscribe = sessionSubscriptionsRef.current.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      sessionSubscriptionsRef.current.delete(sessionId);
    }

    // Update session status
    setAutotradingSessions(prev => {
      const updated = prev.map(s => 
        s.id === sessionId 
          ? {
              ...s,
              analysisStatus: {
                ...s.analysisStatus,
                analyzing: false,
                setupFound: false,
                conditions: [],
              },
              currentPrice: null,
              entryZoneReached: false,
            }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });
  };

  const analyzeAndFindSetupForSession = async (sessionId: string) => {
    const session = autotradingSessions.find(s => s.id === sessionId);
    if (!session || !session.instrument) return;
    
    // Update session to show analyzing
    setAutotradingSessions(prev => {
      const updated = prev.map(s => 
        s.id === sessionId 
          ? {
              ...s,
              analysisStatus: { ...s.analysisStatus, analyzing: true }
            }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });
    
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

      // Call the analysis API
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument: session.instrument,
          // API always uses ['2h', '15m', '5m'] timeframes, so we don't need to specify
        }),
      });

      if (!response.ok) {
        // Handle error response
        let errorMessage = 'Analysis failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

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
          let fetchedPrice = session.currentPrice;
          if (entryPrice && !session.currentPrice && result.final_decision === 'TRADE_SETUP') {
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
          if (entryPrice && (fetchedPrice || session.currentPrice)) {
            const price = fetchedPrice || session.currentPrice;
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

          // Update session with analysis results
          setAutotradingSessions(prev => {
            const updated = prev.map(s => 
              s.id === sessionId 
                ? {
                    ...s,
                    analysisStatus: {
                      analyzing: false,
                      setupFound: result.final_decision === 'TRADE_SETUP',
                      conditions,
                      entryPrice,
                      stopLoss: result.timeframe_5m?.stop_price,
                      targetPrice: result.timeframe_5m?.target_price,
                      direction,
                      timeframe: s.timeframe,
                    },
                    entryZoneReached: isInEntryZone,
                  }
                : s
            );
            // #region agent log
            const updatedSession = updated.find(s => s.id === sessionId);
            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:516',message:'Updated session with analysis results',data:{sessionId,hasEntryPrice:!!updatedSession?.analysisStatus.entryPrice,hasTargetPrice:!!updatedSession?.analysisStatus.targetPrice,hasStopLoss:!!updatedSession?.analysisStatus.stopLoss,entryPrice:updatedSession?.analysisStatus.entryPrice,targetPrice:updatedSession?.analysisStatus.targetPrice,stopLoss:updatedSession?.analysisStatus.stopLoss,direction:updatedSession?.analysisStatus.direction,setupFound:updatedSession?.analysisStatus.setupFound},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            saveSessionsToStorage(updated);
            return updated;
          });

          // If setup found with entry price, start real-time monitoring
          // This ensures we catch entry zone entry even if price isn't there yet
          if (result.final_decision === 'TRADE_SETUP' && entryPrice && direction) {
            // Always start monitoring when we have a setup with entry price
            startRealTimeMonitoringForSession(sessionId, session.instrument, entryPrice, direction, result.timeframe_5m?.stop_price, result.timeframe_5m?.target_price);
          } else {
            stopRealTimeMonitoringForSession(sessionId);
          }

          // If setup found and all conditions met, create pending trade
          if (result.final_decision === 'TRADE_SETUP' && result.timeframe_5m?.trade_signal) {
            await createPendingTradeForSession(sessionId, result);
          }
        }
    } catch (error: any) {
      console.error('Error analyzing:', error);
      const errorMessage = error?.message || 'Unknown error during analysis';
      
      // Update session with error state
      setAutotradingSessions(prev => {
        const updated = prev.map(s => 
          s.id === sessionId 
            ? {
                ...s,
                analysisStatus: { 
                  ...s.analysisStatus, 
                  analyzing: false,
                  setupFound: false,
                  conditions: s.analysisStatus.conditions.map(cond => ({ ...cond, met: false })),
                }
              }
            : s
        );
        saveSessionsToStorage(updated);
        return updated;
      });
      
      // Log error for debugging
      console.error(`[Smart Trade] Analysis failed for session ${sessionId}:`, {
        instrument: session?.instrument,
        error: errorMessage,
        stack: error?.stack,
      });
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

  // Start real-time WebSocket monitoring for a session
  const startRealTimeMonitoringForSession = (
    sessionId: string,
    symbol: string,
    entryPrice: number,
    direction: 'long' | 'short',
    stopLoss?: number,
    targetPrice?: number
  ) => {
    // Clean up existing subscription for this session
    const existingUnsubscribe = sessionSubscriptionsRef.current.get(sessionId);
    if (existingUnsubscribe) {
      existingUnsubscribe();
      sessionSubscriptionsRef.current.delete(sessionId);
    }

    console.log(`[WebSocket] Starting real-time price monitoring for ${symbol} (Session: ${sessionId}) - Entry: ${entryPrice}, Direction: ${direction}`);
    
    const unsubscribe = subscribeToTicks(symbol, (tick) => {
      // Update session with current price
      setAutotradingSessions(prev => {
        const session = prev.find(s => s.id === sessionId);
        if (!session) return prev;
        
        const threshold = entryPrice * 0.001;
        let inEntryZone = false;
        
        if (direction === 'long') {
          inEntryZone = tick.price <= entryPrice + threshold && tick.price >= entryPrice - threshold * 2;
        } else if (direction === 'short') {
          inEntryZone = tick.price >= entryPrice - threshold && tick.price <= entryPrice + threshold * 2;
        }
        
        const updated = prev.map(s => 
          s.id === sessionId 
            ? {
                ...s,
                currentPrice: tick.price,
                entryZoneReached: inEntryZone,
                analysisStatus: {
                  ...s.analysisStatus,
                  conditions: s.analysisStatus.conditions.map(cond => 
                    cond.id === '4' && cond.label === 'Entry zone reached' 
                      ? { ...cond, met: inEntryZone }
                      : cond
                  ),
                },
              }
            : s
        );
        saveSessionsToStorage(updated);
        return updated;
      });
      
      // Check if entry confirmation has occurred (price breaks through entry)
      let entryConfirmed = false;
      if (direction === 'long' && tick.price >= entryPrice) {
        entryConfirmed = true;
        console.log(`[WebSocket] Entry confirmed for LONG: ${tick.price} >= ${entryPrice}`);
      } else if (direction === 'short' && tick.price <= entryPrice) {
        entryConfirmed = true;
        console.log(`[WebSocket] Entry confirmed for SHORT: ${tick.price} <= ${entryPrice}`);
      }
      
      if (entryConfirmed) {
        handleEntryConfirmationForSession(sessionId, symbol, tick.price, direction, entryPrice, stopLoss, targetPrice);
      }
    });

    sessionSubscriptionsRef.current.set(sessionId, unsubscribe);
  };

  // Stop real-time monitoring for a session
  const stopRealTimeMonitoringForSession = (sessionId: string) => {
    const unsubscribe = sessionSubscriptionsRef.current.get(sessionId);
    if (unsubscribe) {
      console.log(`[WebSocket] Stopping real-time price monitoring for session ${sessionId}`);
      unsubscribe();
      sessionSubscriptionsRef.current.delete(sessionId);
    }
    
    setAutotradingSessions(prev => {
      const updated = prev.map(s => 
        s.id === sessionId 
          ? {
              ...s,
              currentPrice: null,
              entryZoneReached: false,
            }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });
  };

  // Handle entry confirmation - execute trade immediately for a session
  const handleEntryConfirmationForSession = async (
    sessionId: string,
    symbol: string,
    price: number,
    direction: 'long' | 'short',
    entryPrice: number,
    stopLoss?: number,
    targetPrice?: number
  ) => {
    const session = autotradingSessions.find(s => s.id === sessionId);
    if (!session) return;

    // Update confirmation signal condition as met
    setAutotradingSessions(prev => {
      const updated = prev.map(s => 
        s.id === sessionId 
          ? {
              ...s,
              analysisStatus: {
                ...s.analysisStatus,
                conditions: s.analysisStatus.conditions.map(cond => 
                  cond.id === '5' && cond.label === 'Confirmation signal' 
                    ? { ...cond, met: true }
                    : cond
                ),
              },
            }
          : s
      );
      saveSessionsToStorage(updated);
      return updated;
    });

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
          lot_size: session.lotSize,
          number_of_positions: session.numberOfPositions,
          account_id: session.accountId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('[WebSocket] Trade executed successfully');
          loadTrades(false);
          // Stop monitoring since trade is executed
          stopRealTimeMonitoringForSession(sessionId);
        }
      }
    } catch (error) {
      console.error('Error executing trade on entry confirmation:', error);
    }
  };

  const createPendingTradeForSession = async (sessionId: string, analysisResult: any) => {
    const session = autotradingSessions.find(s => s.id === sessionId);
    if (!session) return;

    try {
      const response = await fetch('/api/trades/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: session.instrument,
          setups: [{
            type: analysisResult.timeframe_5m.direction === 'long' ? 'bullish' : 'bearish',
            entryZone: analysisResult.timeframe_5m.entry_zone,
            stopLoss: analysisResult.timeframe_5m.stop_level,
            target: analysisResult.timeframe_5m.target_zone,
            trigger: 'Auto-entry on confirmation',
          }],
          lot_size: session.lotSize,
          number_of_positions: session.numberOfPositions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          loadTrades(false);
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
        loadTrades(false);
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
        // Update the trade in the current trades array instead of reloading all trades
        setTrades(prevTrades => 
          prevTrades.map(trade => 
            trade.id === tradeId 
              ? { ...trade, notes: notesValue }
              : trade
          )
        );
        setEditingNotes(null);
        setNotesValue('');
        // Don't reload all trades - just update the specific trade in state
      } else {
        alert(data.error || 'Failed to update notes');
      }
    } catch (error: any) {
      console.error('Error updating notes:', error);
      alert('Error updating notes: ' + error.message);
    }
  };

  const handleStartAutotrading = () => {
    if (!selectedInstrument || !selectedDerivAccount || lotSize < 1 || numberOfPositions < 1) {
      return;
    }

    const newSession: AutotradingSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      instrument: selectedInstrument,
      accountId: selectedDerivAccount.account_id,
      lotSize,
      numberOfPositions,
      timeframe,
      analysisStatus: {
        analyzing: false,
        setupFound: false,
        conditions: [],
        timeframe,
      },
      currentPrice: null,
      entryZoneReached: false,
      startedAt: new Date().toISOString(),
    };

    setAutotradingSessions(prev => {
      const updated = [...prev, newSession];
      saveSessionsToStorage(updated);
      return updated;
    });

    // Start analysis for the new session
    setTimeout(() => {
      startSessionAnalysis(newSession.id);
    }, 100);
  };

  const handleStopAutotrading = (sessionId: string) => {
    stopSessionAnalysis(sessionId);
    setAutotradingSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      saveSessionsToStorage(updated);
      return updated;
    });
  };

  const handleEditSetup = (trade: Trade) => {
    setEditingTrade(trade.id);
    setEditFormData({
      entry_price: trade.entry_price.toString(),
      stop_loss: trade.stop_loss?.toString() || '',
      target_price: trade.target_price?.toString() || '',
      lot_size: trade.lot_size.toString(),
      number_of_positions: trade.number_of_positions.toString(),
    });
  };

  const handleSaveSetup = async (tradeId: string) => {
    try {
      const response = await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_id: tradeId,
          action: 'update_setup',
          entry_price: parseFloat(editFormData.entry_price),
          stop_loss: editFormData.stop_loss ? parseFloat(editFormData.stop_loss) : null,
          target_price: editFormData.target_price ? parseFloat(editFormData.target_price) : null,
          lot_size: parseFloat(editFormData.lot_size),
          number_of_positions: parseInt(editFormData.number_of_positions),
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Update the trade in the current trades array
        setTrades(prevTrades => 
          prevTrades.map(trade => 
            trade.id === tradeId 
              ? { ...trade, ...data.trade }
              : trade
          )
        );
        setEditingTrade(null);
        setEditFormData({
          entry_price: '',
          stop_loss: '',
          target_price: '',
          lot_size: '',
          number_of_positions: '',
        });
      } else {
        alert(data.error || 'Failed to update setup');
      }
    } catch (error: any) {
      console.error('Error updating setup:', error);
      alert('Error updating setup: ' + error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingTrade(null);
    setEditFormData({
      entry_price: '',
      stop_loss: '',
      target_price: '',
      lot_size: '',
      number_of_positions: '',
    });
  };

  // Sort trades by created_at (most recent first) for history, updated_at for others
  const sortedTrades = [...trades].sort((a, b) => {
    if (activeTab === 'history') {
      // For history, sort by created_at to show most recent trades first
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    } else {
      // For other tabs, sort by updated_at to show latest updates first
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    }
  });

  const activeTrades = sortedTrades.filter(t => t.status === 'active' || t.status === 'pending');
  const closedTrades = sortedTrades.filter(t => t.status === 'closed');
  const pendingSetups = sortedTrades.filter(t => t.status === 'pending');
  // History shows all trades (all statuses) sorted by creation date
  const historyTrades = sortedTrades;
  // Filter for automatic trades (trades executed automatically via websocket or monitor)
  const automaticTrades = sortedTrades.filter(t => 
    t.setup_data?.executed_via_websocket === true || 
    t.setup_data?.executed_via_monitor === true ||
    t.setup_data?.executed_at || 
    t.setup_data?.execution_method ||
    (t.status === 'closed' && t.setup_data && Object.keys(t.setup_data).length > 0)
  );
  const displayedTrades = activeTab === 'active' ? activeTrades : activeTab === 'closed' ? closedTrades : activeTab === 'setups' ? pendingSetups : activeTab === 'history' ? historyTrades : activeTab === 'automatic' ? automaticTrades : sortedTrades;
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:715',message:'Trade filtering results',data:{activeTab,totalTrades:trades.length,sortedTradesCount:sortedTrades.length,activeTradesCount:activeTrades.length,closedTradesCount:closedTrades.length,pendingSetupsCount:pendingSetups.length,displayedTradesCount:displayedTrades.length,tradesStatuses:trades.map(t=>t.status),closedTradesStatuses:closedTrades.map(t=>t.status)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [activeTab, trades, sortedTrades, activeTrades, closedTrades, pendingSetups, displayedTrades]);
  // #endregion

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
                  if (account) {
                    setSelectedDerivAccount(account);
                    selectedAccountIdRef.current = account.account_id; // Update ref immediately
                    // Save to localStorage for persistence across page reloads
                    if (typeof window !== 'undefined') {
                      localStorage.setItem(STORAGE_KEY, account.account_id);
                    }
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
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStartAutotrading}
                  disabled={!selectedInstrument || !selectedDerivAccount || lotSize < 1 || numberOfPositions < 1}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  Start Autotrading
                </button>
              </div>
            </div>
          </div>

          {/* Active Autotrading Sessions */}
          {autotradingSessions.length > 0 && (
            <div className="mb-6 space-y-4">
              <h2 className="text-xl font-semibold text-white">Active Autotrading Sessions ({autotradingSessions.length})</h2>
              {autotradingSessions.map((session) => {
                const account = derivApiAccounts.find(acc => acc.account_id === session.accountId);
                const instrument = instruments.find(inst => inst.symbol === session.instrument);
                return (
                  <div key={session.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {instrument?.display_name || session.instrument}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-sm text-gray-400">
                          <span>Account: {account?.account_id || session.accountId}</span>
                          <span>•</span>
                          <span>Lot Size: {session.lotSize}</span>
                          <span>•</span>
                          <span>Positions: {session.numberOfPositions}</span>
                          <span>•</span>
                          <span>Timeframe: {session.timeframe}</span>
                          <span>•</span>
                          <span>Started: {formatTimeOnlyWithTimezone(session.startedAt)}</span>
                        </div>
                        {/* Risk & Reward Calculation */}
                        <div className="mt-3 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                          {/* #region agent log */}
                          {(() => {
                            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:1169',message:'Rendering risk/reward section',data:{sessionId:session.id,hasEntryPrice:!!session.analysisStatus.entryPrice,hasTargetPrice:!!session.analysisStatus.targetPrice,hasStopLoss:!!session.analysisStatus.stopLoss,entryPrice:session.analysisStatus.entryPrice,targetPrice:session.analysisStatus.targetPrice,stopLoss:session.analysisStatus.stopLoss,direction:session.analysisStatus.direction,setupFound:session.analysisStatus.setupFound,lotSize:session.lotSize,numberOfPositions:session.numberOfPositions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            return null;
                          })()}
                          {/* #endregion */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Total Stake:</span>
                              <span className="text-white font-semibold ml-2">
                                {(session.lotSize * session.numberOfPositions).toFixed(2)} {account?.currency || 'USD'}
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
                                {session.lotSize} × {session.numberOfPositions} positions
                              </p>
                            </div>
                            {/* #region agent log */}
                            {(() => {
                              const hasEntry = !!session.analysisStatus.entryPrice;
                              const hasTarget = !!session.analysisStatus.targetPrice;
                              const conditionMet = hasEntry && hasTarget;
                              fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:1180',message:'Checking conditional render for 50% partial and total at TP',data:{sessionId:session.id,hasEntry,hasTarget,conditionMet,entryPrice:session.analysisStatus.entryPrice,targetPrice:session.analysisStatus.targetPrice,entryPriceType:typeof session.analysisStatus.entryPrice,targetPriceType:typeof session.analysisStatus.targetPrice},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                              return null;
                            })()}
                            {/* #endregion */}
                            {session.analysisStatus.entryPrice && session.analysisStatus.targetPrice && (
                              <>
                                <div>
                                  <span className="text-gray-400">50% Partial Profit:</span>
                                  <span className="text-yellow-400 font-semibold ml-2">
                                    {(() => {
                                      const entry = session.analysisStatus.entryPrice!;
                                      const target = session.analysisStatus.targetPrice!;
                                      const direction = session.analysisStatus.direction;
                                      let priceDiff: number;
                                      
                                      if (direction === 'long') {
                                        priceDiff = target - entry;
                                      } else if (direction === 'short') {
                                        priceDiff = entry - target;
                                      } else {
                                        priceDiff = Math.abs(target - entry);
                                      }
                                      
                                      // 50% of positions at target
                                      const partialPositions = Math.ceil(session.numberOfPositions * 0.5);
                                      const partialGain = priceDiff * session.lotSize * partialPositions;
                                      return partialGain.toFixed(2);
                                    })()} {account?.currency || 'USD'}
                                  </span>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Close 50% at TP
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-400">Total at TP:</span>
                                  <span className="text-green-400 font-semibold ml-2">
                                    {(() => {
                                      const entry = session.analysisStatus.entryPrice!;
                                      const target = session.analysisStatus.targetPrice!;
                                      const direction = session.analysisStatus.direction;
                                      let priceDiff: number;
                                      
                                      if (direction === 'long') {
                                        priceDiff = target - entry;
                                      } else if (direction === 'short') {
                                        priceDiff = entry - target;
                                      } else {
                                        priceDiff = Math.abs(target - entry);
                                      }
                                      
                                      const totalGain = priceDiff * session.lotSize * session.numberOfPositions;
                                      const totalStake = session.lotSize * session.numberOfPositions;
                                      const totalAtTP = totalStake + totalGain;
                                      return totalAtTP.toFixed(2);
                                    })()} {account?.currency || 'USD'}
                                  </span>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Stake + Profit at TP
                                  </p>
                                </div>
                              </>
                            )}
                            {session.analysisStatus.entryPrice && session.analysisStatus.stopLoss && (
                              <div>
                                <span className="text-gray-400">Max Risk:</span>
                                <span className="text-red-400 font-semibold ml-2">
                                  {(() => {
                                    const entry = session.analysisStatus.entryPrice!;
                                    const stop = session.analysisStatus.stopLoss!;
                                    const direction = session.analysisStatus.direction;
                                    let priceDiff: number;
                                    
                                    if (direction === 'long') {
                                      priceDiff = entry - stop; // Long loses if price goes down
                                    } else if (direction === 'short') {
                                      priceDiff = stop - entry; // Short loses if price goes up
                                    } else {
                                      priceDiff = Math.abs(entry - stop);
                                    }
                                    
                                    const risk = priceDiff * session.lotSize * session.numberOfPositions;
                                    return risk.toFixed(2);
                                  })()} {account?.currency || 'USD'}
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  If stop loss is hit
                                </p>
                              </div>
                            )}
                            {session.analysisStatus.entryPrice && session.analysisStatus.targetPrice && (
                              <div>
                                <span className="text-gray-400">Full Profit (100%):</span>
                                <span className="text-green-400 font-semibold ml-2">
                                  {(() => {
                                    const entry = session.analysisStatus.entryPrice!;
                                    const target = session.analysisStatus.targetPrice!;
                                    const direction = session.analysisStatus.direction;
                                    let priceDiff: number;
                                    
                                    if (direction === 'long') {
                                      priceDiff = target - entry; // Long profits if price goes up
                                    } else if (direction === 'short') {
                                      priceDiff = entry - target; // Short profits if price goes down
                                    } else {
                                      priceDiff = Math.abs(target - entry);
                                    }
                                    
                                    const gain = priceDiff * session.lotSize * session.numberOfPositions;
                                    return gain.toFixed(2);
                                  })()} {account?.currency || 'USD'}
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  All positions at TP
                                </p>
                              </div>
                            )}
                            {session.analysisStatus.entryPrice && session.analysisStatus.stopLoss && session.analysisStatus.targetPrice && (
                              <div>
                                <span className="text-gray-400">Risk/Reward:</span>
                                <span className="text-white font-semibold ml-2">
                                  {(() => {
                                    const entry = session.analysisStatus.entryPrice!;
                                    const stop = session.analysisStatus.stopLoss!;
                                    const target = session.analysisStatus.targetPrice!;
                                    const direction = session.analysisStatus.direction;
                                    
                                    let risk: number;
                                    let reward: number;
                                    
                                    if (direction === 'long') {
                                      risk = entry - stop;
                                      reward = target - entry;
                                    } else if (direction === 'short') {
                                      risk = stop - entry;
                                      reward = entry - target;
                                    } else {
                                      risk = Math.abs(entry - stop);
                                      reward = Math.abs(target - entry);
                                    }
                                    
                                    if (risk > 0) {
                                      const ratio = reward / risk;
                                      return `1:${ratio.toFixed(2)}`;
                                    }
                                    return 'N/A';
                                  })()}
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  Reward per unit of risk
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleStopAutotrading(session.id)}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                      >
                        Stop
                      </button>
                    </div>

                    {/* Setup Analysis Status */}
                    <div className="mt-3">
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Setup Analysis</h4>
                      {session.analysisStatus.analyzing ? (
                        <div className="flex items-center gap-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
                          <span className="text-gray-300">Analyzing {session.instrument} on {session.timeframe} timeframe...</span>
                        </div>
                      ) : session.analysisStatus.setupFound ? (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-green-400 font-semibold">✓ Setup Found!</span>
                            {session.analysisStatus.direction && (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                session.analysisStatus.direction === 'long' ? 'bg-green-600' : 'bg-red-600'
                              } text-white`}>
                                {session.analysisStatus.direction.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {session.analysisStatus.conditions.map((condition) => (
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
                          {session.analysisStatus.entryPrice && (
                            <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <span className="text-gray-400">Entry:</span>
                                <span className="text-white ml-2">{session.analysisStatus.entryPrice.toFixed(5)}</span>
                              </div>
                              {session.analysisStatus.stopLoss && (
                                <div>
                                  <span className="text-gray-400">Stop Loss:</span>
                                  <span className="text-white ml-2">{session.analysisStatus.stopLoss.toFixed(5)}</span>
                                </div>
                              )}
                              {session.analysisStatus.targetPrice && (
                                <div>
                                  <span className="text-gray-400">Target:</span>
                                  <span className="text-white ml-2">{session.analysisStatus.targetPrice.toFixed(5)}</span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Live Monitoring Status */}
                          {session.entryZoneReached && session.currentPrice && (
                            <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                  <span className="text-blue-400 font-semibold">Live Monitoring Active</span>
                                </div>
                                <span className="text-white font-medium">Current Price: {session.currentPrice.toFixed(5)}</span>
                              </div>
                              <p className="text-blue-300 text-sm mt-1">
                                Waiting for entry confirmation at {session.analysisStatus.entryPrice?.toFixed(5)}...
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-gray-400">Waiting for setup...</span>
                          <div className="space-y-2">
                            {session.analysisStatus.conditions.map((condition) => (
                              <div key={condition.id} className="flex items-center gap-2">
                                <span className="text-gray-500">○</span>
                                <span className="text-gray-400">{condition.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
            onClick={() => setActiveTab('setups')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'setups'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Setups ({pendingSetups.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'history'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            History ({sortedTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('automatic')}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
              activeTab === 'automatic'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Automatic ({automaticTrades.length})
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
              const pnl = trade.pnl ?? 0;
              const pnlPercentage = trade.pnl_percentage ?? 0;
              const isProfit = pnl >= 0;
              // #region agent log
              if (typeof window !== 'undefined') {
                fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/smart-trade/page.tsx:1108',message:'Rendering trade with PNL',data:{tradeId:trade.id,symbol:trade.symbol,status:trade.status,entryPrice:trade.entry_price,currentPrice,rawPnl:trade.pnl,rawPnlPercentage:trade.pnl_percentage,calculatedPnl:pnl,calculatedPnlPercentage:pnlPercentage,lotSize:trade.lot_size,positions:trade.number_of_positions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              }
              // #endregion
              const isAutomatic = trade.setup_data?.executed_via_websocket === true || 
                                  trade.setup_data?.executed_via_monitor === true ||
                                  trade.setup_data?.executed_at || 
                                  trade.setup_data?.execution_method ||
                                  (trade.setup_data && Object.keys(trade.setup_data).length > 0);
              const isClosed = trade.status === 'closed';
              const outcome = isClosed ? (isProfit ? 'win' : 'loss') : null;

              return (
                <div
                  key={trade.id}
                  className={`bg-gray-800 rounded-lg p-4 sm:p-6 border ${
                    isClosed 
                      ? isProfit 
                        ? 'border-green-500/50 bg-green-900/10' 
                        : 'border-red-500/50 bg-red-900/10'
                      : 'border-gray-700'
                  }`}
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
                        {isAutomatic && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-purple-600 text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                            AUTO
                          </span>
                        )}
                        {trade.contract_id && (
                          <span className="text-xs text-gray-400">Contract: {trade.contract_id}</span>
                        )}
                      </div>

                      {editingTrade === trade.id && trade.status === 'pending' ? (
                        <div className="mt-4 space-y-4 p-4 bg-gray-700 rounded-lg border border-blue-500">
                          <h4 className="text-white font-semibold mb-3">Edit Setup</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-1">Entry Price</label>
                              <input
                                type="number"
                                step="0.00001"
                                value={editFormData.entry_price}
                                onChange={(e) => setEditFormData({ ...editFormData, entry_price: e.target.value })}
                                className="w-full bg-gray-600 text-white border border-gray-500 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-1">Stop Loss</label>
                              <input
                                type="number"
                                step="0.00001"
                                value={editFormData.stop_loss}
                                onChange={(e) => setEditFormData({ ...editFormData, stop_loss: e.target.value })}
                                className="w-full bg-gray-600 text-white border border-gray-500 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-1">Target Price</label>
                              <input
                                type="number"
                                step="0.00001"
                                value={editFormData.target_price}
                                onChange={(e) => setEditFormData({ ...editFormData, target_price: e.target.value })}
                                className="w-full bg-gray-600 text-white border border-gray-500 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-1">Lot Size</label>
                              <input
                                type="number"
                                step="0.01"
                                value={editFormData.lot_size}
                                onChange={(e) => setEditFormData({ ...editFormData, lot_size: e.target.value })}
                                className="w-full bg-gray-600 text-white border border-gray-500 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-1">Number of Positions</label>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={editFormData.number_of_positions}
                                onChange={(e) => setEditFormData({ ...editFormData, number_of_positions: e.target.value })}
                                className="w-full bg-gray-600 text-white border border-gray-500 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => handleSaveSetup(trade.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded transition"
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="bg-gray-600 hover:bg-gray-700 text-white text-sm py-2 px-4 rounded transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}

                      {/* Outcome Section for Closed Trades */}
                      {isClosed && (
                        <div className={`mt-4 p-3 rounded-lg border ${
                          isProfit 
                            ? 'bg-green-900/20 border-green-700/50' 
                            : 'bg-red-900/20 border-red-700/50'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${
                                isProfit ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {isProfit ? '✓ WINNING TRADE' : '✗ LOSING TRADE'}
                              </span>
                              {trade.close_reason && (
                                <span className="text-xs text-gray-400">• {trade.close_reason}</span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className={`font-bold text-lg ${
                                isProfit ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                              </div>
                              {trade.close_price && (
                                <div className="text-xs text-gray-400 mt-1">
                                  Closed at: {trade.close_price.toFixed(5)}
                                </div>
                              )}
                            </div>
                          </div>
                          {isAutomatic && (
                            <div className="text-xs text-gray-400 mt-2">
                              Automatically executed via {
                                trade.setup_data?.executed_via_websocket 
                                  ? 'WebSocket' 
                                  : trade.setup_data?.executed_via_monitor || trade.setup_data?.execution_method === 'monitor'
                                  ? 'Monitor'
                                  : 'Auto'
                              }
                              {trade.setup_data?.executed_at && (
                                <span> at {formatTimeOnlyWithTimezone(trade.setup_data.executed_at)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* PNL for Active/Pending Trades */}
                      {!isClosed && (
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
                      )}

                      {/* Notes - Enhanced for Closed Trades */}
                      <div className={`mt-4 ${isClosed ? 'bg-gray-700/50 p-3 rounded-lg border border-gray-600' : ''}`}>
                        {editingNotes === trade.id ? (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              {isClosed ? 'Why did this trade work or not work?' : 'Add notes about this trade...'}
                            </label>
                            <textarea
                              value={notesValue}
                              onChange={(e) => setNotesValue(e.target.value)}
                              placeholder={isClosed 
                                ? "Explain why this trade worked or didn't work. What went right? What went wrong? What can be learned?"
                                : "Add notes about this trade..."
                              }
                              className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={isClosed ? 5 : 3}
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
                                <span className={`text-sm font-medium ${
                                  isClosed ? 'text-gray-300' : 'text-gray-400'
                                }`}>
                                  {isClosed ? 'Trade Analysis & Notes:' : 'Notes:'}
                                </span>
                                <div className={`mt-1 ${isClosed ? 'text-white' : 'text-white text-sm'}`}>
                                  {trade.notes ? (
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                      {trade.notes}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 italic text-sm">
                                        {isClosed 
                                          ? 'No analysis added yet. Click "Add Analysis" to document why this trade worked or didn\'t work.'
                                          : 'No notes yet'
                                        }
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setEditingNotes(trade.id);
                                  setNotesValue(trade.notes || '');
                                }}
                                className={`text-sm ml-2 whitespace-nowrap ${
                                  isClosed 
                                    ? 'text-blue-400 hover:text-blue-300 font-medium' 
                                    : 'text-blue-400 hover:text-blue-300'
                                }`}
                              >
                                {trade.notes ? 'Edit' : isClosed ? 'Add Analysis' : 'Add Notes'}
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
                    {/* Actions */}
                    {trade.status === 'pending' && (
                      <div className="flex flex-col gap-2 mt-4 sm:mt-0">
                        <button
                          onClick={() => editingTrade === trade.id ? handleCancelEdit() : handleEditSetup(trade)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded transition whitespace-nowrap"
                        >
                          {editingTrade === trade.id ? 'Cancel Edit' : 'Edit Setup'}
                        </button>
                      </div>
                    )}
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
