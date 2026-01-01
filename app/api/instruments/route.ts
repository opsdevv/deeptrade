// API Route: /api/instruments - Get available instruments

import { NextRequest, NextResponse } from 'next/server';
import { getAvailableInstruments, DerivInstrument } from '@/lib/api/deriv';

export async function GET(request: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/instruments/route.ts:6',message:'GET /api/instruments entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'dashboard-test',hypothesisId:'DASH1'})}).catch(()=>{});
  // #endregion
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/instruments/route.ts:11',message:'Before getAvailableInstruments',data:{category},timestamp:Date.now(),sessionId:'debug-session',runId:'dashboard-test',hypothesisId:'DASH1'})}).catch(()=>{});
    // #endregion
    
    console.log('[API] Fetching instruments...');
    let instruments = await getAvailableInstruments();
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/instruments/route.ts:15',message:'After getAvailableInstruments',data:{instrumentsCount:instruments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'dashboard-test',hypothesisId:'DASH1'})}).catch(()=>{});
    // #endregion
    
    console.log(`[API] Received ${instruments.length} instruments`);

    // Ensure we always have instruments
    if (!instruments || instruments.length === 0) {
      console.warn('[API] No instruments received, this should not happen');
      // This should never happen as getAvailableInstruments always returns defaults
      instruments = [];
    }

    // Filter by category if provided
    if (category && category !== 'all') {
      instruments = instruments.filter((inst) => inst.category === category);
      console.log(`[API] Filtered to ${instruments.length} instruments for category: ${category}`);
    }

    // Group by category for easier frontend consumption
    const grouped = instruments.reduce((acc, inst) => {
      if (!acc[inst.category]) {
        acc[inst.category] = [];
      }
      acc[inst.category].push(inst);
      return acc;
    }, {} as Record<string, DerivInstrument[]>);

    const response = {
      success: true,
      instruments,
      grouped,
      categories: Object.keys(grouped),
    };

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/instruments/route.ts:44',message:'Before returning response',data:{instrumentsCount:instruments.length,categoriesCount:Object.keys(grouped).length},timestamp:Date.now(),sessionId:'debug-session',runId:'dashboard-test',hypothesisId:'DASH1'})}).catch(()=>{});
    // #endregion
    
    console.log(`[API] Returning ${instruments.length} instruments, ${Object.keys(grouped).length} categories`);
    return NextResponse.json(response);
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/instruments/route.ts:47',message:'Error in GET /api/instruments',data:{error:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'dashboard-test',hypothesisId:'DASH1'})}).catch(()=>{});
    // #endregion
    
    console.error('[API] Error fetching instruments:', error);
    console.error('[API] Error stack:', error.stack);
    
    // Even on error, return default instruments
    const defaultInstruments = [
      { symbol: 'R_50', display_name: 'Volatility 50 Index', category: 'derived' },
      { symbol: 'R_75', display_name: 'Volatility 75 Index', category: 'derived' },
      { symbol: 'R_100', display_name: 'Volatility 100 Index', category: 'derived' },
      { symbol: 'XAUUSD', display_name: 'Gold/USD', category: 'commodities' },
      { symbol: 'GBPJPY', display_name: 'GBP/JPY', category: 'forex' },
      { symbol: 'GBPUSD', display_name: 'GBP/USD', category: 'forex' },
      { symbol: 'EURUSD', display_name: 'EUR/USD', category: 'forex' },
    ];
    
    return NextResponse.json({
      success: true,
      instruments: defaultInstruments,
      grouped: { derived: defaultInstruments.filter(i => i.category === 'derived'), forex: defaultInstruments.filter(i => i.category === 'forex'), commodities: defaultInstruments.filter(i => i.category === 'commodities') },
      categories: ['derived', 'forex', 'commodities'],
      error: error.message || 'Failed to fetch instruments (using defaults)',
    });
  }
}

