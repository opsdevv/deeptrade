'use client';

import { useState, useEffect, useRef } from 'react';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';
import { TextWithClickableNumbers } from '@/components/ui/ClickableNumber';
import ScalpingSetupLedger, { parseScalpingSetups } from './ScalpingSetupLedger';

interface DerivInstrument {
  symbol: string;
  display_name: string;
  category: 'forex' | 'stock_indices' | 'commodities' | 'derived' | 'cryptocurrencies';
  market?: string;
  submarket?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  screenshot_url?: string | null;
  created_at: string;
}

interface ChatSession {
  session_id: string;
  symbol: string | null;
  created_at: string;
  preview: string;
  message_count: number;
}

export default function TradingChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  });
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [instruments, setInstruments] = useState<DerivInstrument[]>([]);
  const [loadingInstruments, setLoadingInstruments] = useState(true);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInstruments();
    loadChatHistory();
    fetchSessions();
  }, []);

  useEffect(() => {
    loadChatHistory();
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchInstruments = async () => {
    try {
      setLoadingInstruments(true);
      const response = await fetch('/api/instruments');
      const data = await response.json();
      if (data.success && data.instruments) {
        setInstruments(data.instruments);
        if (data.instruments.length > 0) {
          setSelectedSymbol(data.instruments[0].symbol);
        }
      }
    } catch (error) {
      console.error('Error fetching instruments:', error);
    } finally {
      setLoadingInstruments(false);
    }
  };

  const loadChatHistory = async () => {
    try {
      const response = await fetch(`/api/chat/standalone?session_id=${sessionId}`);
      const data = await response.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([]);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const response = await fetch('/api/chat/sessions');
      const data = await response.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const switchSession = (newSessionId: string) => {
    setSessionId(newSessionId);
    setMessages([]);
    setInput('');
    setScreenshotFile(null);
    setScreenshotPreview(null);
    // Close sidebar on mobile after selecting a session
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const createNewSession = () => {
    const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
    switchSession(newSessionId);
    // Refresh sessions list after a short delay to allow for new messages
    setTimeout(() => fetchSessions(), 1000);
  };

  const deleteSession = async (sessionIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) {
      return;
    }

    try {
      const response = await fetch(`/api/chat/sessions?session_id=${sessionIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        // If we deleted the current session, create a new one
        if (sessionIdToDelete === sessionId) {
          createNewSession();
        }
        // Refresh sessions list
        fetchSessions();
      } else {
        alert('Failed to delete session: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error deleting session:', error);
      alert('Error deleting session: ' + error.message);
    }
  };

  const formatSessionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const uploadScreenshot = async (file: File): Promise<string | null> => {
    if (!file) return null;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.url) {
        return data.url;
      } else {
        throw new Error(data.error || 'Failed to upload screenshot');
      }
    } catch (error: any) {
      console.error('Error uploading screenshot:', error);
      alert('Failed to upload screenshot: ' + error.message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !screenshotFile) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Upload screenshot if present
    let screenshotUrl: string | null = null;
    if (screenshotFile) {
      screenshotUrl = await uploadScreenshot(screenshotFile);
      setScreenshotFile(null);
      setScreenshotPreview(null);
    }

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      screenshot_url: screenshotUrl,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      // Check if user wants to run analysis
      const runAnalysis = userMessage.toLowerCase().includes('analyze') || 
                         userMessage.toLowerCase().includes('analysis') ||
                         userMessage.toLowerCase().includes('run analysis');

      const requestPayload = {
        session_id: sessionId,
        message: userMessage,
        screenshot_url: screenshotUrl,
        symbol: selectedSymbol,
        run_analysis: runAnalysis && selectedSymbol,
      };
      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:158',message:'Before API call',data:{sessionIdValue:sessionId,sessionIdType:typeof sessionId,sessionIdLength:sessionId?.length,hasMessage:!!userMessage,messageLength:userMessage?.length,hasScreenshot:!!screenshotUrl,symbol:selectedSymbol,runAnalysis:runAnalysis&&selectedSymbol,requestPayload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2,H3,H4,H5'};
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
      } catch (logErr) {
        // Ignore logging errors
      }
      // #endregion
      const response = await fetch('/api/chat/standalone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });
      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:175',message:'After fetch, before parsing',data:{status:response.status,statusText:response.statusText,ok:response.ok,hasBody:!!response.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2,H3,H4,H5'};
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
      } catch (logErr) {
        // Ignore logging errors
      }
      // #endregion
      const data = await response.json();
      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:189',message:'Response parsed',data:{hasSuccess:data.hasOwnProperty('success'),success:data.success,hasMessages:data.hasOwnProperty('messages'),messagesLength:data.messages?.length,hasError:data.hasOwnProperty('error'),error:data.error,fullData:data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2,H3,H4,H5'};
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
      } catch (logErr) {
        // Ignore logging errors
      }
      // #endregion
      if (data.success && data.messages) {
        // Replace temp message with actual messages from server
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.id.startsWith('temp'));
          return [...filtered, ...data.messages];
        });

        // If analysis was run, show a notification
        if (data.analysis) {
          console.log('Analysis completed:', data.analysis);
        }

        // Refresh sessions list after sending a message
        fetchSessions();
      } else {
        // #region agent log
        try {
          const logData = {location:'TradingChatbot.tsx:168',message:'Condition failed: throwing error',data:{success:data.success,hasMessages:!!data.messages,error:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'};
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
        } catch (logErr) {
          // Ignore logging errors
        }
        // #endregion
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert('Error sending message: ' + error.message);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp')));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate image file
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Image size must be less than 10MB');
        return;
      }

      setScreenshotFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the pasted item is an image
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        
        const file = item.getAsFile();
        if (!file) return;

        // Validate image file
        if (!file.type.startsWith('image/')) {
          alert('Please paste a valid image file');
          return;
        }

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('Image size must be less than 10MB');
          return;
        }

        setScreenshotFile(file);
        
        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setScreenshotPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        break; // Only handle the first image
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-900 relative">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } fixed md:relative w-64 h-full transition-all duration-300 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden z-50 md:z-auto`}
      >
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={createNewSession}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="p-4 text-center text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
              <p className="mt-2 text-sm">Loading history...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              No chat history yet
            </div>
          ) : (
            <div className="p-2">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  onClick={() => switchSession(session.session_id)}
                  className={`group relative p-3 rounded-lg mb-2 cursor-pointer transition ${
                    session.session_id === sessionId
                      ? 'bg-gray-700'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {session.symbol && (
                          <span className="text-xs font-medium text-blue-400">
                            {session.symbol}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatSessionDate(session.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 truncate">
                        {session.preview || 'New chat'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.session_id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-400 p-1"
                      title="Delete session"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {/* Header with Symbol Selection and Sidebar Toggle */}
        <div className="bg-gray-800 border-b border-gray-700 p-3 sm:p-4">
          <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-400 hover:text-white transition flex-shrink-0"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <label className="text-xs sm:text-sm font-medium text-gray-300 whitespace-nowrap">
              Symbol:
            </label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={loadingInstruments}
              className="flex-1 min-w-0 bg-gray-700 text-white border border-gray-600 rounded px-2 sm:px-4 py-2 text-sm disabled:opacity-50"
            >
              {loadingInstruments ? (
                <option>Loading symbols...</option>
              ) : (
                instruments.map((inst) => (
                  <option key={inst.symbol} value={inst.symbol}>
                    {inst.display_name} ({inst.symbol})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-4 sm:mt-8 px-4">
              <p className="text-base sm:text-lg mb-2">Welcome to the Trading AI Chatbot!</p>
              <p className="text-xs sm:text-sm">
                Ask me about any symbol, request analysis, or paste/upload screenshots for analysis.
              </p>
              <p className="text-xs sm:text-sm mt-2">
                Try: &quot;Analyze {selectedSymbol}&quot; or &quot;What&apos;s the current bias for {selectedSymbol}?&quot;
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-3xl rounded-lg p-3 sm:p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {message.screenshot_url && (
                  <div className="mb-2">
                    <img
                      src={message.screenshot_url}
                      alt="Screenshot"
                      className="max-w-full h-auto rounded border border-gray-600"
                    />
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-sm sm:text-base">
                  <TextWithClickableNumbers text={message.content} />
                </div>
                {message.role === 'assistant' && (() => {
                  const setups = parseScalpingSetups(message.content);
                  if (setups.length > 0) {
                    return (
                      <ScalpingSetupLedger
                        setups={setups}
                        symbol={selectedSymbol}
                        messageId={message.id}
                      />
                    );
                  }
                  return null;
                })()}
                <div className="text-xs mt-2 opacity-70">
                  {formatTimeOnlyWithTimezone(message.created_at)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-gray-300">DeepSeek is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-gray-800 border-t border-gray-700 p-3 sm:p-4">
        <div className="max-w-4xl mx-auto">
          {/* Screenshot Preview */}
          {screenshotPreview && (
            <div className="mb-3 relative inline-block">
              <img
                src={screenshotPreview}
                alt="Preview"
                className="max-w-[200px] sm:max-w-xs h-auto rounded border border-gray-600"
              />
              <button
                onClick={removeScreenshot}
                className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white px-3 sm:px-4 py-2 rounded-lg transition flex items-center gap-1 sm:gap-2 flex-shrink-0"
              title="Upload screenshot"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="hidden sm:inline">Upload</span>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              placeholder="Ask about any symbol, request analysis, or paste/upload screenshots..."
              disabled={loading || uploading}
              className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none min-w-0"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={loading || uploading || (!input.trim() && !screenshotFile)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold px-4 sm:px-6 py-2 rounded-lg transition text-sm sm:text-base flex-shrink-0"
            >
              {loading ? (
                <span className="hidden sm:inline">Sending...</span>
              ) : (
                <span className="hidden sm:inline">Send</span>
              )}
              {loading ? (
                <svg className="w-5 h-5 sm:hidden animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
