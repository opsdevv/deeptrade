'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { OrderBlock } from '@/types/analysis';

interface OrderBlocksProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  orderBlocks: OrderBlock[];
}

export default function OrderBlocks({
  chart,
  series,
  orderBlocks,
}: OrderBlocksProps) {
  useEffect(() => {
    if (!chart || !series || orderBlocks.length === 0) return;

    orderBlocks.forEach((ob) => {
      // Draw top boundary
      series.createPriceLine({
        price: ob.top,
        color: ob.direction === 'bullish' ? '#26a69a40' : '#ef535040',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      });

      // Draw bottom boundary
      series.createPriceLine({
        price: ob.bottom,
        color: ob.direction === 'bullish' ? '#26a69a40' : '#ef535040',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      });
    });
  }, [chart, series, orderBlocks]);

  return null;
}

