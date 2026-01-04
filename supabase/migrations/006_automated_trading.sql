-- Automated Trading System Schema

-- Deriv account credentials (encrypted)
CREATE TABLE IF NOT EXISTS deriv_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL, -- User-friendly name for the account
  broker TEXT NOT NULL, -- Broker name (e.g., "Deriv", "Binary.com")
  server TEXT NOT NULL, -- Server name (e.g., "real", "demo", "Deriv-Demo", "Deriv-Real")
  login_id TEXT NOT NULL, -- Trading account login ID
  password TEXT NOT NULL, -- Encrypted password
  account_type TEXT NOT NULL CHECK (account_type IN ('real', 'demo')),
  account_id TEXT, -- Deriv account ID (retrieved after login)
  balance DECIMAL(15, 2),
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  is_selected BOOLEAN DEFAULT false, -- Currently selected account for trading
  last_login_at TIMESTAMPTZ, -- Last successful login timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  deriv_account_id UUID REFERENCES deriv_accounts(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price DECIMAL(15, 6) NOT NULL,
  stop_loss DECIMAL(15, 6),
  target_price DECIMAL(15, 6),
  lot_size DECIMAL(10, 2) NOT NULL,
  number_of_positions INTEGER DEFAULT 1,
  current_price DECIMAL(15, 6),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'closed', 'cancelled')) DEFAULT 'pending',
  pnl DECIMAL(15, 2) DEFAULT 0,
  pnl_percentage DECIMAL(10, 4) DEFAULT 0,
  close_price DECIMAL(15, 6),
  close_reason TEXT,
  notes TEXT,
  setup_data JSONB DEFAULT '{}', -- Store original setup information
  trigger_price DECIMAL(15, 6), -- Price that triggers entry
  trigger_condition TEXT, -- e.g., "Break above {price} with momentum"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Trade logs table
CREATE TABLE IF NOT EXISTS trade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('info', 'warning', 'error', 'trade_executed', 'trade_closed', 'price_update', 'cooldown_started', 'cooldown_ended')),
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cooldown periods table
CREATE TABLE IF NOT EXISTS cooldown_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  cooldown_type TEXT NOT NULL CHECK (cooldown_type IN ('loss', 'win')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deriv_accounts_user ON deriv_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_deriv_accounts_selected ON deriv_accounts(user_id, is_selected);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_trade ON trade_logs(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_user ON trade_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_type ON trade_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created ON trade_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cooldown_periods_user ON cooldown_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_cooldown_periods_active ON cooldown_periods(is_active, ends_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trades_updated_at();

CREATE TRIGGER update_deriv_accounts_updated_at
  BEFORE UPDATE ON deriv_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
