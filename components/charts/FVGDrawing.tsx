'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { FVG } from '@/types/analysis';

interface FVGDrawingProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  fvgs: FVG[];
}

export default function FVGDrawing({
  chart,
  series,
  fvgs,
}: FVGDrawingProps) {
  useEffect(() => {
    if (!chart || !series || fvgs.length === 0) return;

    fvgs.forEach((fvg, index) => {
      const isBullish = fvg.direction === 'bullish';
      const fillColor = isBullish
        ? 'rgba(38, 166, 154, 0.15)' // Light teal for bullish FVG
        : 'rgba(239, 83, 80, 0.15)'; // Light red for bearish FVG
      const borderColor = isBullish ? '#26a69a' : '#ef5350';

      // Create filled area for FVG (using price lines as boundaries)
      // Top boundary
      series.createPriceLine({
        price: fvg.top,
        color: borderColor,
        lineWidth: 2,
        lineStyle: 1, // Solid
        axisLabelVisible: true,
        title: `FVG ${fvg.direction.toUpperCase()} Top`,
      });

      // Bottom boundary
      series.createPriceLine({
        price: fvg.bottom,
        color: borderColor,
        lineWidth: 2,
        lineStyle: 1, // Solid
        axisLabelVisible: true,
        title: `FVG ${fvg.direction.toUpperCase()} Bottom`,
      });

      // Add a horizontal line in the middle to show FVG zone
      const midPrice = (fvg.top + fvg.bottom) / 2;
      series.createPriceLine({
        price: midPrice,
        color: borderColor,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `FVG ${fvg.direction.toUpperCase()} Zone`,
      });
    });

    return () => {
      // Cleanup handled by chart
    };
  }, [chart, series, fvgs]);

  return null;
}

