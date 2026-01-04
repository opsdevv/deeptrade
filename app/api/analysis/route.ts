// API Route: /api/analysis - Run analysis

import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequest, TimeframeData } from '@/types/analysis';
import { analyze } from '@/lib/analysis/engine';
import { fetchMarketDataForTimeframes } from '@/lib/data/fetcher';
import { createServerClient } from '@/lib/supabase/client';
import { redisCache, CacheKeys } from '@/lib/redis/client';
import { checkRateLimit, RateLimits } from '@/lib/redis/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');

    if (!runId) {
      return NextResponse.json(
        { error: 'Missing run_id parameter' },
        { status: 400 }
      );
    }

    // Try to get from Redis cache first (for temp IDs and all cached results)
    const cachedResult = await redisCache.get(CacheKeys.analysis(runId));
    if (cachedResult) {
      return NextResponse.json({
        success: true,
        result: cachedResult,
      });
    }

    // Try to get from Supabase
    let supabase;
    try {
      supabase = createServerClient();
    } catch {
      supabase = null;
    }

    if (supabase) {
      try {
        const { data: analysisRun, error: runError } = await supabase
          .from('analysis_runs')
          .select(`
            id,
            instrument_id,
            timestamp,
            data_window_start,
            data_window_end,
            instruments!inner(symbol),
            analysis_results(timeframe, result_data),
            trade_signals(signal_type, direction, entry_zone, stop_level, target_zone, confidence, signal_data)
          `)
          .eq('id', runId)
          .single();

        if (!runError && analysisRun) {
          // Reconstruct analysis result from database
          const run = analysisRun as any;
          const instrument = (run.instruments as any)?.symbol || 'UNKNOWN';
          const results = (run.analysis_results as any[]) || [];
          const signal = (run.trade_signals as any[])?.[0];

          const analysisResult = {
            instrument,
            timestamp: new Date(run.timestamp).getTime(),
            data_window_start: new Date(run.data_window_start).getTime(),
            data_window_end: new Date(run.data_window_end).getTime(),
            timeframe_2h: results.find((r) => r.timeframe === '2h')?.result_data || {},
            timeframe_15m: results.find((r) => r.timeframe === '15m')?.result_data || {},
            timeframe_5m: results.find((r) => r.timeframe === '5m')?.result_data || {},
            final_decision: signal?.signal_type || 'NO_TRADE',
            session_valid: true,
            instrument_config: signal?.signal_data?.instrument_config || {},
          };

          // Cache the result in Redis (1 hour TTL)
          await redisCache.set(CacheKeys.analysis(runId), analysisResult, 3600);

          return NextResponse.json({
            success: true,
            result: analysisResult,
          });
        }
      } catch (dbError: any) {
        console.warn('[WARN] Failed to fetch from database:', dbError.message);
      }
    }

    // If not found in cache or database
    return NextResponse.json(
      { error: 'Analysis run not found' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error fetching analysis:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analysis' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const rateLimit = await checkRateLimit('analysis', {
      ...RateLimits.analysis,
      identifier: clientId,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait before running another analysis.',
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RateLimits.analysis.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
          },
        }
      );
    }

    const body: AnalysisRequest = await request.json();

    if (!body.instrument) {
      return NextResponse.json(
        { error: 'Missing instrument' },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = createServerClient();
    } catch (supabaseError: any) {
      // If Supabase fails, continue without it (for testing)
      console.warn('[WARN] Supabase not available, skipping database operations');
      supabase = null;
    }

    // Get or create instrument (skip if Supabase not available)
    let instrumentId: string | null = null;
    let runId: string | null = null;
    
    if (supabase) {
      try {
        // Get or create instrument
        let { data: instrumentData } = await supabase
          .from('instruments')
          .select('id')
          .eq('symbol', body.instrument.toUpperCase())
          .single();

        if (!instrumentData) {
          const { data: newInstrument } = await supabase
            .from('instruments')
            .insert({
              symbol: body.instrument.toUpperCase(),
              type: 'forex', // Default, will be updated by analysis
            })
            .select('id')
            .single();

          instrumentData = newInstrument;
        }

        instrumentId = instrumentData?.id || null;

        // Create analysis run
        const { data: analysisRun, error: runError } = await supabase
          .from('analysis_runs')
          .insert({
            instrument_id: instrumentId,
            timestamp: new Date().toISOString(),
            data_window_start: new Date().toISOString(),
            data_window_end: new Date().toISOString(),
            status: 'pending',
          })
          .select('id')
          .single();

        if (runError || !analysisRun) {
          console.warn('[WARN] Failed to create analysis run in Supabase:', runError);
          runId = `temp-${Date.now()}`;
        } else {
          runId = analysisRun.id;
        }
      } catch (dbError: any) {
        console.warn('[WARN] Database operation failed, continuing without DB:', dbError.message);
        runId = `temp-${Date.now()}`;
      }
    } else {
      runId = `temp-${Date.now()}`;
    }

    try {
      // Fetch data if not provided
      let data: Record<string, TimeframeData[]> = body.data || {};

      if (!data['2h'] || !data['15m'] || !data['5m']) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/analysis/route.ts:176',message:'Before fetchMarketDataForTimeframes',data:{instrument:body.instrument,has2h:!!data['2h'],has15m:!!data['15m'],has5m:!!data['5m']},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const fetchedData = await fetchMarketDataForTimeframes(
          body.instrument,
          ['2h', '15m', '5m']
        );
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/analysis/route.ts:182',message:'After fetchMarketDataForTimeframes',data:{'2h_length':fetchedData['2h']?.length||0,'15m_length':fetchedData['15m']?.length||0,'5m_length':fetchedData['5m']?.length||0,'2h_type':typeof fetchedData['2h'],'15m_type':typeof fetchedData['15m'],'5m_type':typeof fetchedData['5m'],fetchedKeys:Object.keys(fetchedData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        data = {
          '2h': fetchedData['2h'] || [],
          '15m': fetchedData['15m'] || [],
          '5m': fetchedData['5m'] || [],
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/analysis/route.ts:189',message:'After data assignment',data:{'2h_length':data['2h']?.length||0,'15m_length':data['15m']?.length||0,'5m_length':data['5m']?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }

      // Validate that all timeframes have data
      const missingTimeframes: string[] = [];
      if (!data['2h'] || data['2h'].length === 0) {
        missingTimeframes.push('2h');
      }
      if (!data['15m'] || data['15m'].length === 0) {
        missingTimeframes.push('15m');
      }
      if (!data['5m'] || data['5m'].length === 0) {
        missingTimeframes.push('5m');
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/analysis/route.ts:201',message:'Before missingTimeframes check',data:{'2h_length':data['2h']?.length||0,'15m_length':data['15m']?.length||0,'5m_length':data['5m']?.length||0,missingTimeframes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (missingTimeframes.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `No data available for timeframe(s): ${missingTimeframes.join(', ')}. Please try again later.`,
            missingTimeframes,
          },
          { status: 400 }
        );
      }

      // Run analysis
      const result = analyze(body.instrument, {
        '2h': data['2h'],
        '15m': data['15m'],
        '5m': data['5m'],
      });

      // Update analysis run status (skip if Supabase not available)
      if (supabase && runId && !runId.startsWith('temp-')) {
        try {
          await supabase
            .from('analysis_runs')
            .update({
              status: 'completed',
              data_window_start: new Date(result.data_window_start).toISOString(),
              data_window_end: new Date(result.data_window_end).toISOString(),
            })
            .eq('id', runId);

          // Store analysis results
          await supabase.from('analysis_results').insert([
            {
              analysis_run_id: runId,
              timeframe: '2h',
              result_data: result.timeframe_2h,
            },
            {
              analysis_run_id: runId,
              timeframe: '15m',
              result_data: result.timeframe_15m,
            },
            {
              analysis_run_id: runId,
              timeframe: '5m',
              result_data: result.timeframe_5m,
            },
          ]);

          // Store trade signal
          await supabase.from('trade_signals').insert({
            analysis_run_id: runId,
            signal_type: result.final_decision,
            direction: result.timeframe_5m.direction,
            entry_zone: result.timeframe_5m.entry_zone,
            stop_level: result.timeframe_5m.stop_level,
            target_zone: result.timeframe_5m.target_zone,
            confidence: result.timeframe_5m.confidence,
            signal_data: result,
          });
        } catch (dbError: any) {
          console.warn('[WARN] Failed to store results in database:', dbError.message);
        }
      }

      // Store in Redis cache (1 hour TTL for temp IDs, 24 hours for real IDs)
      if (runId) {
        const cacheTTL = runId.startsWith('temp-') ? 3600 : 86400; // 1 hour or 24 hours
        await redisCache.set(CacheKeys.analysis(runId), result, cacheTTL);
      }

      return NextResponse.json({
        success: true,
        analysis_run_id: runId,
        result,
      }, {
        headers: {
          'X-RateLimit-Limit': RateLimits.analysis.maxRequests.toString(),
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
        },
      });
    } catch (error: any) {
      
      // Update status to failed (skip if Supabase not available)
      if (supabase && runId && !runId.startsWith('temp-')) {
        try {
          await supabase
            .from('analysis_runs')
            .update({ status: 'failed' })
            .eq('id', runId);
        } catch (dbError) {
          // Ignore DB errors during error handling
        }
      }

      // Ensure we return a proper JSON response even on error
      return NextResponse.json(
        { 
          success: false,
          error: error.message || 'Failed to run analysis',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error running analysis:', error);
    
    // Ensure we always return valid JSON
    try {
      return NextResponse.json(
        { 
          success: false,
          error: error.message || 'Failed to run analysis',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        { status: 500 }
      );
    } catch (jsonError) {
      // Last resort: return plain text if JSON fails
      return new NextResponse(
        `Error: ${error.message || 'Failed to run analysis'}`,
        { status: 500, headers: { 'Content-Type': 'text/plain' } }
      );
    }
  }
}

