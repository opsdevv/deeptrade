'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { TimeframeData, ChartDrawingData } from '@/types/analysis';
import { getPriceDecimals } from '@/lib/utils/price-format';
import ICTDrawings from './ICTDrawings';
import { SupportResistanceLevel } from '@/lib/ict/support-resistance';

interface PriceChartProps {
  data: TimeframeData[];
  height?: number;
  timeframe: string;
  instrument?: string;
  drawingData?: ChartDrawingData;
  supportResistance?: SupportResistanceLevel[];
}

export default function PriceChart({
  data,
  height = 400,
  timeframe,
  instrument = 'GBPUSD',
  drawingData,
  supportResistance = [],
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const isInitializingRef = useRef(false);
  const containerKeyRef = useRef(0);

  // Get price decimals for instrument (calculated outside effect for dependency array)
  const priceDecimals = getPriceDecimals(instrument);

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (isInitializingRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:38',message:'Skipping duplicate StrictMode effect run',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return;
    }
    isInitializingRef.current = true;
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:34',message:'useEffect entry',data:{hasContainer:!!chartContainerRef.current,dataLength:data?.length,height,instrument,priceDecimals,existingChart:!!chartRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion
    if (!chartContainerRef.current) {
      isInitializingRef.current = false;
      return;
    }

    // Clean up existing chart if it exists (prevents assertion error when creating new chart on same container)
    if (chartRef.current) {
      // #region agent log
      const childrenBefore = chartContainerRef.current?.childElementCount || 0;
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:40',message:'Cleaning up existing chart before creating new one',data:{childrenBefore},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      // Increment container key to force React to recreate the container element
      // This ensures lightweight-charts has no leftover state on the DOM element
      containerKeyRef.current += 1;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:49',message:'After cleanup - container key incremented',data:{newKey:containerKeyRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Reset initialization flag before returning early
      // React will remount the container with new key, then this effect will run again
      isInitializingRef.current = false;
      return;
    }

    // #region agent log
    const containerWidth = chartContainerRef.current.clientWidth;
    const containerHeight = chartContainerRef.current.clientHeight;
    const containerChildren = chartContainerRef.current.childElementCount;
    // Check for any data attributes or properties that lightweight-charts might set
    const containerDataAttrs = chartContainerRef.current ? Array.from(chartContainerRef.current.attributes)
      .filter(attr => attr.name.startsWith('data-') || attr.name.startsWith('lwc-'))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(',') : '';
    // Check if container has any non-standard properties
    const containerKeys = chartContainerRef.current ? Object.keys(chartContainerRef.current).filter(k => k.startsWith('_') || k.includes('chart')).join(',') : '';
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:57',message:'Before createChart - container state',data:{containerWidth,containerHeight,height,isZeroWidth:containerWidth===0,isZeroHeight:containerHeight===0,containerChildren,containerDataAttrs,containerKeys},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Ensure container is attached to DOM before creating chart
    if (!chartContainerRef.current.isConnected) {
      isInitializingRef.current = false;
      return;
    }

    if (containerWidth === 0 || containerHeight === 0) {
      isInitializingRef.current = false;
      return;
    }

    // Ensure container is completely empty before creating chart
    // This prevents assertion errors from lightweight-charts detecting leftover state
    if (chartContainerRef.current && chartContainerRef.current.childElementCount > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:75',message:'Container has children, clearing before createChart',data:{childCount:chartContainerRef.current.childElementCount},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      chartContainerRef.current.innerHTML = '';
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height,
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: false,
      },
    });

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:71',message:'After createChart',data:{chartCreated:!!chart,chartType:typeof chart},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion

    // Validate chart was created successfully
    if (!chart) {
      console.error('Failed to create chart');
      isInitializingRef.current = false;
      return;
    }

    chartRef.current = chart;

    // Add series immediately after chart creation (lightweight-charts should be ready)
    // #region agent log
    const containerHasChildren = chartContainerRef.current?.childElementCount || 0;
    const containerInDOM = chartContainerRef.current?.isConnected ?? false;
    // Check chart object properties to see if it has any internal state
    const chartKeys = chart ? Object.keys(chart).filter(k => !k.startsWith('_')).slice(0, 10).join(',') : '';
    // Try to access chart's series count if possible (may not be accessible)
    const chartSeriesCount = (chart as any)?._series?.length ?? 'unknown';
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:111',message:'Before addSeries (immediate)',data:{dataLength:data?.length,chartExists:!!chart,containerHasChildren,containerInDOM,chartKeys,chartSeriesCount},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B,D'})}).catch(()=>{});
    // #endregion
    
    // Create candlestick series (using v5.0+ API)
    let candlestickSeries;
    try {
      // Ensure chart.addSeries method exists before calling
      if (typeof chart.addSeries !== 'function') {
        throw new Error('chart.addSeries is not a function');
      }
      candlestickSeries = chart.addSeries({
        type: 'Candlestick',
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      } as any);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:123',message:'After addSeries',data:{seriesCreated:!!candlestickSeries},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:126',message:'addSeries error caught (immediate)',data:{errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // If addSeries fails, we can't continue - the chart is in an invalid state
      isInitializingRef.current = false;
      throw error;
    }
    
    seriesRef.current = candlestickSeries as ISeriesApi<'Candlestick'>;

    // Set price formatter for the chart (after series is created)
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:135',message:'Before applyOptions',data:{priceDecimals},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    chart.applyOptions({
      localization: {
        priceFormatter: (price: number) => {
          return price.toFixed(priceDecimals);
        },
      },
    });
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:143',message:'After applyOptions',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    // Format and set data
    const formattedData = data.map((d) => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeries.setData(formattedData);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceChart.tsx:130',message:'Cleanup function called',data:{chartExists:!!chart},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      isInitializingRef.current = false;
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [data, height, instrument, priceDecimals]);

  // Prepare data for ICT drawings
  const drawingDataForTimeframe = drawingData || {
    fvgs: [],
    liquidity: { buy_side: [], sell_side: [] },
    order_blocks: [],
    premium_discount: {
      range_high: 0,
      range_low: 0,
      current: 'premium' as const,
      pd_level: 0,
    },
    trade_levels: { entry: null, stop: null, target: null },
    mss_points: [],
    displacement: [],
    session_markers: [],
  };

  const chartDataForDrawings = data.map((d) => ({
    time: d.time,
    high: d.high,
    low: d.low,
  }));

  return (
    <div className="w-full">
      <div className="text-sm text-gray-400 mb-2">Timeframe: {timeframe}</div>
      <div 
        key={`chart-container-${timeframe}-${containerKeyRef.current}`}
        ref={chartContainerRef} 
        className="w-full" 
        style={{ height }} 
      />
      {chartRef.current && seriesRef.current && (
        <ICTDrawings
          chart={chartRef.current}
          series={seriesRef.current}
          drawingData={drawingDataForTimeframe}
          data={chartDataForDrawings}
          supportResistance={supportResistance}
        />
      )}
    </div>
  );
}

