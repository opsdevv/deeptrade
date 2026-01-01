'use client';

import { useState, useEffect } from 'react';
import { formatTimeWithTimezone } from '@/lib/utils/price-format';

interface Prompt {
  id: string;
  prompt_text: string;
  generated_at: string;
  analysis_run_id: string;
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePrompt = async () => {
    if (!selectedRunId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/deepseek', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysis_run_id: selectedRunId,
          use_api: false, // Set to true to also call DeepSeek API
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPrompt(data.prompt);
        // Refresh prompts list
        fetchPrompts();
      } else {
        alert('Failed to generate prompt: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrompts = async () => {
    // This would fetch from Supabase
    // Simplified for now
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">DeepSeek Prompt Generator</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Generate Prompt</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Analysis Run ID
              </label>
              <input
                type="text"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                placeholder="Enter analysis run ID"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded px-4 py-2"
              />
            </div>

            <button
              onClick={generatePrompt}
              disabled={loading || !selectedRunId}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              {loading ? 'Generating...' : 'Generate Prompt'}
            </button>
          </div>
        </div>

        {prompt && (
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Generated Prompt</h2>
              <button
                onClick={copyToClipboard}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm whitespace-pre-wrap">
              {prompt}
            </pre>
          </div>
        )}

        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Prompt History</h2>
          {prompts.length === 0 ? (
            <p className="text-gray-400">No prompts generated yet</p>
          ) : (
            <div className="space-y-2">
              {prompts.map((p) => (
                <div
                  key={p.id}
                  className="bg-gray-700 rounded p-4 cursor-pointer hover:bg-gray-600 transition"
                  onClick={() => setPrompt(p.prompt_text)}
                >
                  <p className="text-sm text-gray-400">
                    {formatTimeWithTimezone(p.generated_at)}
                  </p>
                  <p className="text-sm mt-1 line-clamp-2">{p.prompt_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

