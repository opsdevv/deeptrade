'use client';

import { useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface LiquidityZonesProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  liquidity: {
    buy_side: number[];
    sell_side: number[];
  };
}

export default function LiquidityZones({
  chart,
  series,
  liquidity,
}: LiquidityZonesProps) {
  useEffect(() => {
    if (!chart || !series) return;

    // Draw buy-side liquidity (equal lows)
    liquidity.buy_side.forEach((price) => {
      series.createPriceLine({
        price,
        color: '#3b82f680',
        lineWidth: 2,
        lineStyle: 1, // Solid
        axisLabelVisible: true,
        title: 'Buy-side Liquidity',
      });
    });

    // Draw sell-side liquidity (equal highs)
    liquidity.sell_side.forEach((price) => {
      series.createPriceLine({
        price,
        color: '#ef535080',
        lineWidth: 2,
        lineStyle: 1, // Solid
        axisLabelVisible: true,
        title: 'Sell-side Liquidity',
      });
    });
  }, [chart, series, liquidity]);

  return null;
}

