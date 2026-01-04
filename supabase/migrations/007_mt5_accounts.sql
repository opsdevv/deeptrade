-- MT5 Accounts Schema

-- MT5 account credentials
CREATE TABLE IF NOT EXISTS mt5_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL, -- User-friendly name for the account
  broker TEXT NOT NULL, -- Broker name (e.g., "IC Markets", "FXTM")
  server TEXT NOT NULL, -- MT5 server name
  login_id TEXT NOT NULL, -- MT5 account login ID
  password TEXT NOT NULL, -- Encrypted password
  account_type TEXT NOT NULL CHECK (account_type IN ('real', 'demo')),
  account_id TEXT, -- MT5 account ID (same as login_id typically)
  balance DECIMAL(15, 2),
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  is_selected BOOLEAN DEFAULT false, -- Currently selected account for trading
  last_login_at TIMESTAMPTZ, -- Last successful login timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_user ON mt5_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_selected ON mt5_accounts(user_id, is_selected);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_mt5_accounts_updated_at
  BEFORE UPDATE ON mt5_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
