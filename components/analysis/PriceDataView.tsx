'use client';

import { TimeframeData, ChartDrawingData } from '@/types/analysis';
import { formatPrice, formatPriceRange, formatTimeWithTimezone } from '@/lib/utils/price-format';
import { SupportResistanceLevel } from '@/lib/ict/support-resistance';
import ClickablePrice from '@/components/ui/ClickablePrice';

interface PriceDataViewProps {
  data: TimeframeData[];
  timeframe: string;
  instrument: string;
  drawingData?: ChartDrawingData;
  supportResistance?: SupportResistanceLevel[];
}

export default function PriceDataView({
  data,
  timeframe,
  instrument,
  drawingData,
  supportResistance = [],
}: PriceDataViewProps) {
  // Format timestamp to readable date with timezone
  const formatTime = (timestamp: number) => {
    return formatTimeWithTimezone(timestamp);
  };

  // Show last 20 candles
  const recentData = data.slice(-20).reverse();

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

  return (
    <div className="w-full space-y-4">
      {/* Premium/Discount Zone */}
      {drawingDataForTimeframe.premium_discount.range_high > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-base sm:text-lg font-semibold mb-2">Premium/Discount Zone</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Current Position</p>
              <p className={`text-lg font-semibold ${
                drawingDataForTimeframe.premium_discount.current === 'premium' 
                  ? 'text-red-400' 
                  : 'text-green-400'
              }`}>
                {drawingDataForTimeframe.premium_discount.current.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Range</p>
              <p className="text-sm">
                <ClickablePrice price={drawingDataForTimeframe.premium_discount.range_low} instrument={instrument} className="text-sm" /> - <ClickablePrice price={drawingDataForTimeframe.premium_discount.range_high} instrument={instrument} className="text-sm" />
              </p>
              <p className="text-gray-400 text-xs mt-1">
                PD Level: <ClickablePrice price={drawingDataForTimeframe.premium_discount.pd_level} instrument={instrument} className="text-xs text-gray-400" />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Levels */}
      {(drawingDataForTimeframe.trade_levels.entry || 
        drawingDataForTimeframe.trade_levels.stop || 
        drawingDataForTimeframe.trade_levels.target) && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-base sm:text-lg font-semibold mb-3">Trade Levels</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-900/30 rounded p-3 border-l-4 border-blue-500">
              <p className="text-gray-400 text-sm">Entry</p>
              <p className="text-lg font-semibold text-blue-400">
                <ClickablePrice price={drawingDataForTimeframe.trade_levels.entry} instrument={instrument} className="text-lg font-semibold text-blue-400" />
              </p>
            </div>
            <div className="bg-red-900/30 rounded p-3 border-l-4 border-red-500">
              <p className="text-gray-400 text-sm">Stop Loss</p>
              <p className="text-lg font-semibold text-red-400">
                <ClickablePrice price={drawingDataForTimeframe.trade_levels.stop} instrument={instrument} className="text-lg font-semibold text-red-400" />
              </p>
            </div>
            <div className="bg-green-900/30 rounded p-3 border-l-4 border-green-500">
              <p className="text-gray-400 text-sm">Take Profit</p>
              <p className="text-lg font-semibold text-green-400">
                <ClickablePrice price={drawingDataForTimeframe.trade_levels.target} instrument={instrument} className="text-lg font-semibold text-green-400" />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fair Value Gaps */}
      {drawingDataForTimeframe.fvgs.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Fair Value Gaps ({drawingDataForTimeframe.fvgs.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {drawingDataForTimeframe.fvgs.map((fvg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 ${
                  fvg.direction === 'bullish'
                    ? 'bg-green-900/20 border-green-500'
                    : 'bg-red-900/20 border-red-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold capitalize">{fvg.direction} FVG</p>
                    <p className="text-sm text-gray-400">
                      {formatTime(fvg.startTime)} - {formatTime(fvg.endTime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      <ClickablePrice price={fvg.bottom} instrument={instrument} className="text-sm" /> - <ClickablePrice price={fvg.top} instrument={instrument} className="text-sm" />
                    </p>
                    <p className="text-xs text-gray-400">
                      Size: <ClickablePrice price={fvg.top - fvg.bottom} instrument={instrument} className="text-xs text-gray-400" />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Blocks */}
      {drawingDataForTimeframe.order_blocks.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Order Blocks ({drawingDataForTimeframe.order_blocks.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {drawingDataForTimeframe.order_blocks.map((ob, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 ${
                  ob.direction === 'bullish'
                    ? 'bg-green-900/20 border-green-500'
                    : 'bg-red-900/20 border-red-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold capitalize">{ob.direction} Order Block</p>
                    <p className="text-sm text-gray-400">
                      {formatTime(ob.startTime)} - {formatTime(ob.endTime)}
                    </p>
                    {ob.strength && (
                      <p className="text-xs text-gray-400 mt-1">Strength: {ob.strength}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      <ClickablePrice price={ob.bottom} instrument={instrument} className="text-sm" /> - <ClickablePrice price={ob.top} instrument={instrument} className="text-sm" />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liquidity Zones */}
      {(drawingDataForTimeframe.liquidity.buy_side.length > 0 || 
        drawingDataForTimeframe.liquidity.sell_side.length > 0) && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Liquidity Zones</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-2">Buy-Side Liquidity</p>
              <div className="space-y-1">
                {drawingDataForTimeframe.liquidity.buy_side.map((price, idx) => (
                  <div key={idx} className="bg-green-900/20 rounded p-2 text-sm">
                    <ClickablePrice price={price} instrument={instrument} className="text-sm" />
                  </div>
                ))}
                {drawingDataForTimeframe.liquidity.buy_side.length === 0 && (
                  <p className="text-gray-500 text-sm">None detected</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Sell-Side Liquidity</p>
              <div className="space-y-1">
                {drawingDataForTimeframe.liquidity.sell_side.map((price, idx) => (
                  <div key={idx} className="bg-red-900/20 rounded p-2 text-sm">
                    <ClickablePrice price={price} instrument={instrument} className="text-sm" />
                  </div>
                ))}
                {drawingDataForTimeframe.liquidity.sell_side.length === 0 && (
                  <p className="text-gray-500 text-sm">None detected</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Support & Resistance Levels */}
      {supportResistance.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Support & Resistance Levels</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {supportResistance.slice(0, 10).map((level, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 ${
                  level.type === 'support'
                    ? 'bg-green-900/20 border-green-500'
                    : 'bg-red-900/20 border-red-500'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold capitalize">{level.type}</p>
                    <p className="text-xs text-gray-400">
                      {level.touches} touch{level.touches !== 1 ? 'es' : ''} • Strength: {(level.strength * 100).toFixed(0)}%
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    <ClickablePrice price={level.price} instrument={instrument} className="text-lg font-semibold" />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Structure Shifts */}
      {drawingDataForTimeframe.mss_points.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Market Structure Shifts ({drawingDataForTimeframe.mss_points.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {drawingDataForTimeframe.mss_points.map((mss, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 ${
                  mss.direction === 'bullish'
                    ? 'bg-green-900/20 border-green-500'
                    : 'bg-red-900/20 border-red-500'
                }`}
              >
                <div>
                  <p className="font-semibold capitalize">{mss.direction} MSS</p>
                  <p className="text-sm text-gray-400">{formatTime(mss.time)}</p>
                  {(mss.previousHigh || mss.newHigh) && (
                    <p className="text-xs text-gray-400 mt-1">
                      High: {mss.previousHigh ? <ClickablePrice price={mss.previousHigh} instrument={instrument} className="text-xs text-gray-400" /> : 'N/A'} → {mss.newHigh ? <ClickablePrice price={mss.newHigh} instrument={instrument} className="text-xs text-gray-400" /> : 'N/A'}
                    </p>
                  )}
                  {(mss.previousLow || mss.newLow) && (
                    <p className="text-xs text-gray-400">
                      Low: {mss.previousLow ? <ClickablePrice price={mss.previousLow} instrument={instrument} className="text-xs text-gray-400" /> : 'N/A'} → {mss.newLow ? <ClickablePrice price={mss.newLow} instrument={instrument} className="text-xs text-gray-400" /> : 'N/A'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Displacement Data */}
      {drawingDataForTimeframe.displacement.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Displacement Events ({drawingDataForTimeframe.displacement.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {drawingDataForTimeframe.displacement.map((disp, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 ${
                  disp.direction === 'bullish'
                    ? 'bg-green-900/20 border-green-500'
                    : 'bg-red-900/20 border-red-500'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold capitalize">{disp.direction} Displacement</p>
                    <p className="text-sm text-gray-400">{formatTime(disp.time)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">Strength: {(disp.strength * 100).toFixed(0)}%</p>
                    <p className="text-xs text-gray-400">Candle #{disp.candleIndex}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Price Data Table */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-base sm:text-lg font-semibold mb-3">Recent Price Data (Last 20 Candles)</h3>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="inline-block min-w-full align-middle px-4 sm:px-0">
            <table className="min-w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left py-2 px-3 text-gray-400">Time</th>
                <th className="text-right py-2 px-3 text-gray-400">Open</th>
                <th className="text-right py-2 px-3 text-gray-400">High</th>
                <th className="text-right py-2 px-3 text-gray-400">Low</th>
                <th className="text-right py-2 px-3 text-gray-400">Close</th>
                <th className="text-right py-2 px-3 text-gray-400">Change</th>
              </tr>
            </thead>
            <tbody>
              {recentData.map((candle, idx) => {
                const change = candle.close - candle.open;
                const changePercent = ((change / candle.open) * 100);
                const isPositive = change >= 0;
                return (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-600/30">
                    <td className="py-2 px-3 text-gray-300 text-xs">
                      {formatTime(candle.time)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      <ClickablePrice price={candle.open} instrument={instrument} className="text-gray-300" />
                    </td>
                    <td className="py-2 px-3 text-right text-green-400">
                      <ClickablePrice price={candle.high} instrument={instrument} className="text-green-400" />
                    </td>
                    <td className="py-2 px-3 text-right text-red-400">
                      <ClickablePrice price={candle.low} instrument={instrument} className="text-red-400" />
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      <ClickablePrice price={candle.close} instrument={instrument} className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`} />
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{changePercent.toFixed(3)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}

