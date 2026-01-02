-- Watchlist Signals table for tracking instruments and trade signals
CREATE TABLE IF NOT EXISTS watchlist_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('watching', 'signal_ready', 'active', 'hit_sl', 'hit_tp', 'closed')) DEFAULT 'watching',
  direction TEXT CHECK (direction IN ('long', 'short')),
  entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC[], -- Array of TP levels
  current_price NUMERIC,
  price_updated_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ, -- When last analysis was run
  added_at TIMESTAMPTZ DEFAULT NOW(),
  signal_generated_at TIMESTAMPTZ, -- When signal became ready
  trade_started_at TIMESTAMPTZ, -- When user marked as active/entered
  trade_closed_at TIMESTAMPTZ,
  exit_price NUMERIC,
  exit_reason TEXT CHECK (exit_reason IN ('tp', 'sl', 'manual')),
  notes TEXT,
  analysis_data JSONB DEFAULT '{}', -- Store the analysis result
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_watchlist_signals_user ON watchlist_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_signals_status ON watchlist_signals(status);
CREATE INDEX IF NOT EXISTS idx_watchlist_signals_instrument ON watchlist_signals(instrument);
CREATE INDEX IF NOT EXISTS idx_watchlist_signals_user_status ON watchlist_signals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_watchlist_signals_created_at ON watchlist_signals(created_at DESC);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_watchlist_signals_updated_at
  BEFORE UPDATE ON watchlist_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
