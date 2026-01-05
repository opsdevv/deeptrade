// Core type definitions for ICT/SMC Analysis Framework

export type Timeframe = '2h' | '15m' | '5m';
export type Bias = 'bullish' | 'bearish' | 'neutral';
export type PremiumDiscount = 'premium' | 'discount';
export type LiquidityType = 'buy-side' | 'sell-side';
export type ReactionStrength = 'weak' | 'strong';
export type SignalType = 'NO_TRADE' | 'WATCH' | 'TRADE_SETUP';
export type Direction = 'long' | 'short' | null;
export type Confidence = 'low' | 'medium' | 'high';
export type InstrumentType = 'volatility' | 'forex' | 'synthetic';

// OHLCV Data Structure
export interface TimeframeData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Fair Value Gap
export interface FVG {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  direction: 'bullish' | 'bearish';
  timeframe: Timeframe;
}

// Order Block
export interface OrderBlock {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  direction: 'bullish' | 'bearish';
  timeframe: Timeframe;
  strength?: 'weak' | 'medium' | 'strong';
}

// Market Structure Shift
export interface MSS {
  time: number;
  direction: 'bullish' | 'bearish';
  previousHigh?: number;
  previousLow?: number;
  newHigh?: number;
  newLow?: number;
  timeframe: Timeframe;
}

// Displacement Data
export interface DisplacementData {
  time: number;
  strength: number; // 0-1 scale
  direction: 'bullish' | 'bearish';
  candleIndex: number;
  timeframe: Timeframe;
}

// Liquidity Pool
export interface LiquidityPool {
  price: number;
  type: LiquidityType;
  timeframe: Timeframe;
  timestamp: number;
  description?: string; // e.g., "Asian Range High", "Prior Session Low"
}

// Session Marker
export interface SessionMarker {
  time: number;
  session: 'london-open' | 'ny-kill-zone' | 'asian-range';
  label: string;
}

// Swing Point
export interface SwingPoint {
  price: number;
  time: number;
}

// 2H Bias Analysis Output
export interface BiasAnalysis {
  bias: Bias;
  range_high: number;
  range_low: number;
  premium_discount: PremiumDiscount;
  key_liquidity: {
    buy_side: number[];
    sell_side: number[];
  };
  htf_zone: string;
  fvgs: FVG[];
  order_blocks: OrderBlock[];
  liquidity_pools: LiquidityPool[];
  pd_level: number; // 50% level
  swing_highs: SwingPoint[];
  swing_lows: SwingPoint[];
}

// 15m Liquidity Analysis Output
export interface LiquidityAnalysis {
  liquidity_taken: boolean;
  liquidity_type: LiquidityType | null;
  reaction_strength: ReactionStrength | null;
  fvg_present: boolean;
  setup_valid: boolean;
  displacement_detected: boolean;
  liquidity_sweeps: {
    price: number;
    time: number;
    type: LiquidityType;
  }[];
  fvgs: FVG[];
  displacement: DisplacementData[];
  swing_highs: SwingPoint[];
  swing_lows: SwingPoint[];
}

// 5m Execution Signal Output
export interface ExecutionSignal {
  trade_signal: boolean;
  direction: Direction;
  entry_zone: string;
  stop_level: string;
  target_zone: string;
  confidence: Confidence;
  mss_confirmed: boolean;
  fvg_details: FVG | null;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  risk_reward_ratio: number | null;
  swing_highs: SwingPoint[];
  swing_lows: SwingPoint[];
}

// Complete Analysis Result
export interface AnalysisResult {
  instrument: string;
  timestamp: number;
  data_window_start: number;
  data_window_end: number;
  timeframe_2h: BiasAnalysis;
  timeframe_15m: LiquidityAnalysis;
  timeframe_5m: ExecutionSignal;
  final_decision: SignalType;
  session_valid: boolean;
  instrument_config: InstrumentConfig;
}

// Trade Signal (Final Decision)
export interface TradeSignal {
  signal_type: SignalType;
  direction: Direction;
  entry_zone: string;
  stop_level: string;
  target_zone: string;
  confidence: Confidence;
  analysis_run_id?: string;
  timestamp: number;
}

// Instrument Configuration
export interface InstrumentConfig {
  symbol: string;
  type: InstrumentType;
  use_session_filter: boolean;
  prioritize_mss: boolean;
  ignore_order_blocks: boolean;
  full_ict_model: boolean;
  custom_rules?: Record<string, any>;
}

// Chart Drawing Data
export interface ChartDrawingData {
  fvgs: FVG[];
  liquidity: {
    buy_side: number[];
    sell_side: number[];
  };
  order_blocks: OrderBlock[];
  premium_discount: {
    range_high: number;
    range_low: number;
    current: PremiumDiscount;
    pd_level: number;
  };
  trade_levels: {
    entry: number | null;
    stop: number | null;
    target: number | null;
  };
  mss_points: MSS[];
  displacement: DisplacementData[];
  session_markers: SessionMarker[];
}

// DeepSeek API Response
export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// API Request/Response Types
export interface AnalysisRequest {
  instrument: string;
  data?: {
    '2h'?: TimeframeData[];
    '15m'?: TimeframeData[];
    '5m'?: TimeframeData[];
  };
}

export interface DataRequest {
  instrument: string;
  timeframes: Timeframe[];
}

export interface DeepSeekRequest {
  analysis_run_id: string;
  use_api?: boolean;
}

