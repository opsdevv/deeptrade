// API Route: /api/instruments - Get available instruments

import { NextRequest, NextResponse } from 'next/server';
import { getAvailableInstruments, getDefaultInstruments, DerivInstrument } from '@/lib/api/deriv';
import { createServerClient } from '@/lib/supabase/client';

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
    
    console.log(`[API] Received ${instruments.length} instruments from Deriv API`);

    // Also fetch instruments from Supabase (instruments that have been analyzed before)
    let supabaseInstruments: DerivInstrument[] = [];
    try {
      const supabase = createServerClient();
      const { data: dbInstruments, error: dbError } = await supabase
        .from('instruments')
        .select('symbol, type, config')
        .order('created_at', { ascending: false });

      if (!dbError && dbInstruments && dbInstruments.length > 0) {
        console.log(`[API] Found ${dbInstruments.length} instruments in Supabase`);
        
        // Map Supabase instruments to DerivInstrument format
        supabaseInstruments = dbInstruments.map((dbInst: any) => {
          // Map Supabase type to category
          let category: DerivInstrument['category'] = 'forex';
          if (dbInst.type === 'volatility' || dbInst.type === 'synthetic') {
            category = 'derived';
          } else if (dbInst.type === 'forex') {
            category = 'forex';
          }
          
          // Try to get display name from config or generate from symbol
          let displayName = dbInst.config?.display_name;
          if (!displayName) {
            // Generate a readable name from symbol
            const symbol = dbInst.symbol.toUpperCase();
            if (symbol.startsWith('FRX')) {
              displayName = symbol.substring(3).replace(/([A-Z]+)([A-Z]+)/, '$1/$2');
            } else {
              displayName = symbol.replace(/_/g, ' ');
            }
          }
          
          return {
            symbol: dbInst.symbol,
            display_name: displayName,
            category,
          };
        });
      }
    } catch (supabaseError: any) {
      // Supabase is optional, just log and continue
      console.warn('[API] Could not fetch instruments from Supabase:', supabaseError.message);
    }

    // Merge instruments from Deriv API and Supabase, removing duplicates by symbol
    const instrumentMap = new Map<string, DerivInstrument>();
    
    // Add Deriv API instruments first (they have more complete info)
    instruments.forEach(inst => {
      instrumentMap.set(inst.symbol.toUpperCase(), inst);
    });
    
    // Add Supabase instruments, but don't overwrite existing ones
    supabaseInstruments.forEach(inst => {
      const key = inst.symbol.toUpperCase();
      if (!instrumentMap.has(key)) {
        instrumentMap.set(key, inst);
      }
    });
    
    instruments = Array.from(instrumentMap.values());
    console.log(`[API] Total instruments after merge: ${instruments.length} (${instruments.length - supabaseInstruments.length} from Deriv, ${supabaseInstruments.length} from Supabase)`);

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
    
    // Extract category from request URL (in case of error)
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    // Even on error, return full default instruments list
    const defaultInstruments = getDefaultInstruments();
    
    // Also try to get instruments from Supabase
    let supabaseInstruments: DerivInstrument[] = [];
    try {
      const supabase = createServerClient();
      const { data: dbInstruments, error: dbError } = await supabase
        .from('instruments')
        .select('symbol, type, config')
        .order('created_at', { ascending: false });

      if (!dbError && dbInstruments && dbInstruments.length > 0) {
        console.log(`[API] Found ${dbInstruments.length} instruments in Supabase (error fallback)`);
        
        supabaseInstruments = dbInstruments.map((dbInst: any) => {
          let category: DerivInstrument['category'] = 'forex';
          if (dbInst.type === 'volatility' || dbInst.type === 'synthetic') {
            category = 'derived';
          } else if (dbInst.type === 'forex') {
            category = 'forex';
          }
          
          let displayName = dbInst.config?.display_name;
          if (!displayName) {
            const symbol = dbInst.symbol.toUpperCase();
            if (symbol.startsWith('FRX')) {
              displayName = symbol.substring(3).replace(/([A-Z]+)([A-Z]+)/, '$1/$2');
            } else {
              displayName = symbol.replace(/_/g, ' ');
            }
          }
          
          return {
            symbol: dbInst.symbol,
            display_name: displayName,
            category,
          };
        });
      }
    } catch (supabaseError: any) {
      console.warn('[API] Could not fetch instruments from Supabase (error fallback):', supabaseError.message);
    }
    
    // Merge defaults and Supabase instruments
    const instrumentMap = new Map<string, DerivInstrument>();
    defaultInstruments.forEach(inst => {
      instrumentMap.set(inst.symbol.toUpperCase(), inst);
    });
    supabaseInstruments.forEach(inst => {
      const key = inst.symbol.toUpperCase();
      if (!instrumentMap.has(key)) {
        instrumentMap.set(key, inst);
      }
    });
    
    let instruments = Array.from(instrumentMap.values());
    
    // Filter by category if provided
    if (category && category !== 'all') {
      instruments = instruments.filter((inst) => inst.category === category);
    }
    
    // Group by category for easier frontend consumption
    const grouped = instruments.reduce((acc, inst) => {
      if (!acc[inst.category]) {
        acc[inst.category] = [];
      }
      acc[inst.category].push(inst);
      return acc;
    }, {} as Record<string, DerivInstrument[]>);
    
    return NextResponse.json({
      success: true,
      instruments,
      grouped,
      categories: Object.keys(grouped),
      error: error.message || 'Failed to fetch instruments (using defaults)',
    });
  }
}

