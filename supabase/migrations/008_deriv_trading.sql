-- Add trading fields to deriv_accounts table
ALTER TABLE deriv_accounts 
ADD COLUMN IF NOT EXISTS api_token TEXT; -- API token for trading operations

-- Add trading fields to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS contract_id TEXT, -- Deriv contract ID
ADD COLUMN IF NOT EXISTS contract_type TEXT, -- CALL, PUT, RISE, FALL, etc.
ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(10, 2), -- Stake amount
ADD COLUMN IF NOT EXISTS contract_duration INTEGER, -- Duration in seconds
ADD COLUMN IF NOT EXISTS contract_purchase_time TIMESTAMPTZ, -- When contract was bought
ADD COLUMN IF NOT EXISTS contract_sell_time TIMESTAMPTZ; -- When contract was sold

-- Add indexes for better query performance
-- Index for accounts with API tokens (simplified - doesn't require is_selected column)
CREATE INDEX IF NOT EXISTS idx_deriv_accounts_api_token 
ON deriv_accounts(user_id) 
WHERE api_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_contract_id 
ON trades(contract_id) 
WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_contract_status 
ON trades(status, contract_id) 
WHERE contract_id IS NOT NULL;
