// API Route: /api/data - Fetch market data

import { NextRequest, NextResponse } from 'next/server';
import { DataRequest, Timeframe } from '@/types/analysis';
import { fetchMarketDataForTimeframes } from '@/lib/data/fetcher';

export async function POST(request: NextRequest) {
  try {
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
    });
  } catch (error: any) {
    console.error('Error fetching market data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}

