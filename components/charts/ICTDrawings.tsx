'use client';

import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartDrawingData } from '@/types/analysis';
import FVGDrawing from './FVGDrawing';
import LiquidityZones from './LiquidityZones';
import OrderBlocks from './OrderBlocks';
import PDZones from './PDZones';
import TradeLevels from './TradeLevels';
import MSSMarkers from './MSSMarkers';
import SupportResistance from './SupportResistance';
import { SupportResistanceLevel } from '@/lib/ict/support-resistance';

interface ICTDrawingsProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  drawingData: ChartDrawingData;
  data: Array<{ time: number; high: number; low: number }>;
  supportResistance?: SupportResistanceLevel[];
}

export default function ICTDrawings({
  chart,
  series,
  drawingData,
  data,
  supportResistance = [],
}: ICTDrawingsProps) {
  if (!chart || !series) return null;

  return (
    <>
      <FVGDrawing chart={chart} series={series} fvgs={drawingData.fvgs} />
      {supportResistance.length > 0 && (
        <SupportResistance
          chart={chart}
          series={series}
          levels={supportResistance}
        />
      )}
      <LiquidityZones
        chart={chart}
        series={series}
        liquidity={drawingData.liquidity}
      />
      <OrderBlocks
        chart={chart}
        series={series}
        orderBlocks={drawingData.order_blocks}
      />
      <PDZones
        chart={chart}
        series={series}
        pdData={drawingData.premium_discount}
      />
      <TradeLevels
        chart={chart}
        series={series}
        levels={drawingData.trade_levels}
      />
      <MSSMarkers
        chart={chart}
        series={series}
        mssPoints={drawingData.mss_points}
        data={data}
      />
    </>
  );
}

