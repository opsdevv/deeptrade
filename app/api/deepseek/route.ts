// API Route: /api/deepseek - Generate DeepSeek prompt

import { NextRequest, NextResponse } from 'next/server';
import { DeepSeekRequest } from '@/types/analysis';
import { createServerClient } from '@/lib/supabase/client';
import { generatePrompt } from '@/lib/prompts/deepseek';
import { callDeepSeekAPI, extractJSONFromResponse } from '@/lib/api/deepseek';

export async function POST(request: NextRequest) {
  try {
    const body: DeepSeekRequest = await request.json();

    if (!body.analysis_run_id) {
      return NextResponse.json(
        { error: 'Missing analysis_run_id' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get analysis run and results
    const { data: analysisRun, error: runError } = await supabase
      .from('analysis_runs')
      .select(`
        id,
        instrument_id,
        instruments!inner(symbol),
        analysis_results(timeframe, result_data),
        trade_signals(signal_type, direction, entry_zone, stop_level, target_zone, confidence, signal_data)
      `)
      .eq('id', body.analysis_run_id)
      .single();

    if (runError || !analysisRun) {
      return NextResponse.json(
        { error: 'Analysis run not found' },
        { status: 404 }
      );
    }

    // Reconstruct analysis result from database
    const instrument = (analysisRun.instruments as any)?.symbol || 'UNKNOWN';
    const results = (analysisRun.analysis_results as any[]) || [];
    const signal = (analysisRun.trade_signals as any[])?.[0];

    const analysisResult = {
      instrument,
      timestamp: new Date(analysisRun.timestamp).getTime(),
      data_window_start: new Date(analysisRun.data_window_start).getTime(),
      data_window_end: new Date(analysisRun.data_window_end).getTime(),
      timeframe_2h: results.find((r) => r.timeframe === '2h')?.result_data || {},
      timeframe_15m: results.find((r) => r.timeframe === '15m')?.result_data || {},
      timeframe_5m: results.find((r) => r.timeframe === '5m')?.result_data || {},
      final_decision: signal?.signal_type || 'NO_TRADE',
      session_valid: true,
      instrument_config: signal?.signal_data?.instrument_config || {},
    };

    // Generate prompt
    const prompt = generatePrompt(analysisResult, instrument);

    // Store prompt
    const { data: promptData, error: promptError } = await supabase
      .from('deepseek_prompts')
      .insert({
        analysis_run_id: body.analysis_run_id,
        prompt_text: prompt,
      })
      .select('id')
      .single();

    if (promptError) {
      console.error('Error storing prompt:', promptError);
    }

    let response = null;
    let responseData = null;

    // Optionally call DeepSeek API
    if (body.use_api) {
      try {
        response = await callDeepSeekAPI(prompt);
        responseData = extractJSONFromResponse(response);

        // Update prompt with response
        if (promptData) {
          await supabase
            .from('deepseek_prompts')
            .update({ response_data: responseData })
            .eq('id', promptData.id);
        }
      } catch (apiError: any) {
        console.error('Error calling DeepSeek API:', apiError);
        // Continue without API response
      }
    }

    return NextResponse.json({
      success: true,
      prompt_id: promptData?.id,
      prompt,
      response: responseData,
      analysis_run_id: body.analysis_run_id,
    });
  } catch (error: any) {
    console.error('Error generating DeepSeek prompt:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate prompt' },
      { status: 500 }
    );
  }
}

