'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { SupportResistanceLevel } from '@/lib/ict/support-resistance';

interface SupportResistanceProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  levels: SupportResistanceLevel[];
}

export default function SupportResistance({
  chart,
  series,
  levels,
}: SupportResistanceProps) {
  useEffect(() => {
    if (!chart || !series || levels.length === 0) return;

    levels.forEach((level) => {
      const color =
        level.type === 'support'
          ? `rgba(16, 185, 129, ${0.3 + level.strength * 0.4})` // Green for support
          : `rgba(239, 68, 68, ${0.3 + level.strength * 0.4})`; // Red for resistance

      series.createPriceLine({
        price: level.price,
        color: level.type === 'support' ? '#10b981' : '#ef4444',
        lineWidth: level.strength > 0.7 ? 3 : level.strength > 0.4 ? 2 : 1,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: `${level.type === 'support' ? 'Support' : 'Resistance'} (${level.touches}x)`,
      });
    });

    return () => {
      // Cleanup handled by chart
    };
  }, [chart, series, levels]);

  return null;
}

