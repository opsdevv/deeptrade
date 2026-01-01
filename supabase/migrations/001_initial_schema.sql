-- Initial Database Schema for ICT Scalping Analysis Framework

-- Instruments table
CREATE TABLE IF NOT EXISTS instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('volatility', 'forex', 'synthetic')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis runs table
CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  data_window_start TIMESTAMPTZ NOT NULL,
  data_window_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis results table
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('2h', '15m', '5m')),
  result_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade signals table
CREATE TABLE IF NOT EXISTS trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('NO_TRADE', 'WATCH', 'TRADE_SETUP')),
  direction TEXT CHECK (direction IN ('long', 'short')),
  entry_zone TEXT,
  stop_level TEXT,
  target_zone TEXT,
  confidence TEXT CHECK (confidence IN ('low', 'medium', 'high')),
  signal_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DeepSeek prompts table
CREATE TABLE IF NOT EXISTS deepseek_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  response_data JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analysis_runs_instrument ON analysis_runs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_timestamp ON analysis_runs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_run ON analysis_results(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_trade_signals_run ON trade_signals(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_trade_signals_type ON trade_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_deepseek_prompts_run ON deepseek_prompts(analysis_run_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON instruments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

