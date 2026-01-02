// DeepSeek API Client

import { DeepSeekResponse } from '@/types/analysis';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * Call DeepSeek API with conversation messages
 */
export async function callDeepSeekAPI(
  messages: ChatMessage[] | string,
  model: string = 'deepseek-chat'
): Promise<DeepSeekResponse> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  // Handle legacy string prompt format
  const messageArray: ChatMessage[] = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  // Check if any message contains images - if so, use vision model
  const hasImages = messageArray.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some((item: any) => item.type === 'image_url')
  );
  
  // Use vision model if images are present (DeepSeek-V2.5 supports vision)
  const selectedModel = hasImages ? 'deepseek-chat' : model;

  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messageArray,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as DeepSeekResponse;
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
    throw error;
  }
}

/**
 * Extract JSON from DeepSeek response
 */
export function extractJSONFromResponse(response: DeepSeekResponse): any {
  try {
    const content = response.choices[0]?.message?.content || '';
    
    // Try to find JSON in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, return the content as-is
    return { content };
  } catch (error) {
    console.error('Error extracting JSON from response:', error);
    return { error: 'Failed to parse response' };
  }
}

