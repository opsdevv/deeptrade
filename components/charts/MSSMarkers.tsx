'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { MSS } from '@/types/analysis';

interface MSSMarkersProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  mssPoints: MSS[];
  data: Array<{ time: number; high: number; low: number }>;
}

export default function MSSMarkers({
  chart,
  series,
  mssPoints,
  data,
}: MSSMarkersProps) {
  useEffect(() => {
    if (!chart || !series || mssPoints.length === 0) return;

    const markers: any[] = [];

    mssPoints.forEach((mss) => {
      const candle = data.find((d) => d.time === mss.time);
      if (!candle) return;

      const price = mss.direction === 'bullish' ? candle.high : candle.low;

      markers.push({
        time: mss.time as any,
        position: mss.direction === 'bullish' ? 'belowBar' : 'aboveBar',
        color: mss.direction === 'bullish' ? '#26a69a' : '#ef5350',
        shape: mss.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
        text: 'MSS',
      });
    });

    if (markers.length > 0) {
      series.setMarkers(markers);
    }
  }, [chart, series, mssPoints, data]);

  return null;
}

