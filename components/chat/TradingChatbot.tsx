'use client';

import { useState, useEffect, useRef } from 'react';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';

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

export default function TradingChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInstruments();
    loadChatHistory();
  }, []);

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
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const uploadScreenshot = async (file: File): Promise<string | null> => {
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
      }
      return null;
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      return null;
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

      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:142',message:'Before API call',data:{sessionIdValue:sessionId,hasMessage:!!userMessage,hasScreenshot:!!screenshotUrl,symbol:selectedSymbol,runAnalysis:runAnalysis&&selectedSymbol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3,H5'};
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
        body: JSON.stringify({
          session_id: sessionId,
          message: userMessage,
          screenshot_url: screenshotUrl,
          symbol: selectedSymbol,
          run_analysis: runAnalysis && selectedSymbol,
        }),
      });

      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:155',message:'After fetch, before parsing',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3,H5'};
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
      } catch (logErr) {
        // Ignore logging errors
      }
      // #endregion
      const data = await response.json();
      // #region agent log
      try {
        const logData = {location:'TradingChatbot.tsx:156',message:'Response parsed',data:{hasSuccess:data.hasOwnProperty('success'),success:data.success,hasMessages:data.hasOwnProperty('messages'),messagesLength:data.messages?.length,hasError:data.hasOwnProperty('error'),error:data.error,fullData:data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'};
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
      // Remove temp message and show error
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp')));
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error.message}. Please try again.`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select an image file');
    }
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-900">
      {/* Header with Symbol Selection */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <label className="text-sm font-medium text-gray-300">
            Symbol:
          </label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            disabled={loadingInstruments}
            className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-4 py-2 disabled:opacity-50"
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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <p className="text-lg mb-2">Welcome to the Trading AI Chatbot!</p>
              <p className="text-sm">
                Ask me about any symbol, request analysis, or upload screenshots for analysis.
              </p>
              <p className="text-sm mt-2">
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
                className={`max-w-3xl rounded-lg p-4 ${
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
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div className="text-xs mt-2 opacity-70">
                  {formatTimeOnlyWithTimezone(message.created_at)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-100 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Screenshot Preview */}
          {screenshotPreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={screenshotPreview}
                alt="Preview"
                className="max-w-xs h-auto rounded border border-gray-600"
              />
              <button
                onClick={removeScreenshot}
                className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
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
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
              title="Upload screenshot"
            >
              📷
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about any symbol, request analysis, or discuss trading strategies..."
              className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 resize-none focus:outline-none focus:border-blue-500"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !screenshotFile)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
