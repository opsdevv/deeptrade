'use client';

import { useState, useEffect, useRef } from 'react';
import { formatTimeOnlyWithTimezone } from '@/lib/utils/price-format';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  screenshot_url?: string;
  created_at: string;
}

interface DeepSeekChatProps {
  runId: string;
  analysisData?: any;
}

export default function DeepSeekChat({ runId, analysisData }: DeepSeekChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMessages();
  }, [runId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/chat?run_id=${runId}`);
      const data = await response.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!screenshotFile) return null;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', screenshotFile);
      formData.append('run_id', runId);

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

  const sendMessage = async () => {
    if (!input.trim() && !screenshotFile) return;

    const userMessage = input.trim();
    const userScreenshot = screenshotFile;

    // Clear input and screenshot
    setInput('');
    removeScreenshot();

    // Upload screenshot if present
    let screenshotUrl: string | null = null;
    if (userScreenshot) {
      screenshotUrl = await uploadScreenshot();
    }

    // Add user message to UI immediately
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage || '[Screenshot]',
      screenshot_url: screenshotUrl || undefined,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    setLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          run_id: runId,
          message: userMessage || 'Please analyze this screenshot along with the analysis data.',
          screenshot_url: screenshotUrl,
          analysis_data: analysisData,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Replace temp message with real one and add assistant response
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
          return [
            ...filtered,
            ...(data.messages || []).filter((m: ChatMessage) => m.id !== tempUserMessage.id),
          ];
        });
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert('Error sending message: ' + error.message);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 flex flex-col h-[600px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">DeepSeek AI Chat</h2>
        <span className="text-sm text-gray-400">Ask questions about this analysis</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p className="mb-2">Start a conversation with DeepSeek AI</p>
            <p className="text-sm">Ask questions about the analysis or upload screenshots for further analysis</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                }`}
              >
                {message.screenshot_url && (
                  <div className="mb-3">
                    <img
                      src={message.screenshot_url}
                      alt="Screenshot"
                      className="max-w-full h-auto rounded border border-gray-600"
                    />
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                <div className="text-xs mt-2 opacity-70">
                  {formatTimeOnlyWithTimezone(message.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
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

      {/* Screenshot Preview */}
      {screenshotPreview && (
        <div className="mb-3 relative inline-block">
          <img
            src={screenshotPreview}
            alt="Preview"
            className="max-w-xs h-auto rounded border border-gray-600"
          />
          <button
            onClick={removeScreenshot}
            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleScreenshotSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || loading}
          className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
          title="Upload screenshot"
        >
          <svg
            className="w-5 h-5"
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
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question or upload a screenshot..."
          disabled={loading || uploading}
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          rows={2}
        />
        <button
          onClick={sendMessage}
          disabled={loading || uploading || (!input.trim() && !screenshotFile)}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

