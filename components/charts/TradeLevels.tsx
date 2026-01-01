'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface TradeLevelsProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  levels: {
    entry: number | null;
    stop: number | null;
    target: number | null;
  };
}

export default function TradeLevels({
  chart,
  series,
  levels,
}: TradeLevelsProps) {
  useEffect(() => {
    if (!chart || !series) return;

    // Entry level
    if (levels.entry) {
      series.createPriceLine({
        price: levels.entry,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Entry',
      });
    }

    // Stop level
    if (levels.stop) {
      series.createPriceLine({
        price: levels.stop,
        color: '#ef5350',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Stop Loss',
      });
    }

    // Target level
    if (levels.target) {
      series.createPriceLine({
        price: levels.target,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Target',
      });
    }
  }, [chart, series, levels]);

  return null;
}

