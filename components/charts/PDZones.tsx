'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface PDZonesProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  pdData: {
    range_high: number;
    range_low: number;
    current: 'premium' | 'discount';
    pd_level: number;
  };
}

export default function PDZones({
  chart,
  series,
  pdData,
}: PDZonesProps) {
  useEffect(() => {
    if (!chart || !series) return;

    // Draw 50% PD level
    series.createPriceLine({
      price: pdData.pd_level,
      color: '#fbbf2480',
      lineWidth: 2,
      lineStyle: 0, // Solid
      axisLabelVisible: true,
      title: '50% PD Level',
    });

    // Draw range high
    series.createPriceLine({
      price: pdData.range_high,
      color: pdData.current === 'premium' ? '#10b98180' : '#6b728080',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Range High',
    });

    // Draw range low
    series.createPriceLine({
      price: pdData.range_low,
      color: pdData.current === 'discount' ? '#ef535080' : '#6b728080',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Range Low',
    });
  }, [chart, series, pdData]);

  return null;
}

