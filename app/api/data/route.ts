// API Route: /api/data - Fetch market data

import { NextRequest, NextResponse } from 'next/server';
import { DataRequest, Timeframe } from '@/types/analysis';
import { fetchMarketDataForTimeframes } from '@/lib/data/fetcher';
import { checkRateLimit, RateLimits } from '@/lib/redis/rate-limit';

// Vercel serverless functions timeout after 10s (Hobby) or 60s (Pro)
// Market data fetching can take time, especially with WebSocket operations
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const rateLimit = await checkRateLimit('marketData', {
      ...RateLimits.marketData,
      identifier: clientId,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RateLimits.marketData.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
          },
        }
      );
    }

    const body: DataRequest = await request.json();

    if (!body.instrument || !body.timeframes || body.timeframes.length === 0) {
      return NextResponse.json(
        { error: 'Missing instrument or timeframes' },
        { status: 400 }
      );
    }

    // Fetch data for all requested timeframes
    const data = await fetchMarketDataForTimeframes(
      body.instrument,
      body.timeframes as Timeframe[]
    );

    return NextResponse.json({
      success: true,
      instrument: body.instrument,
      data,
      timestamp: Date.now(),
    }, {
      headers: {
        'X-RateLimit-Limit': RateLimits.marketData.maxRequests.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching market data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}

