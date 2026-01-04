# Deriv API Autotrading Setup Guide

## Overview

This guide will help you set up automated trading via the Deriv API. The system can now:
- ✅ Connect multiple Deriv accounts (demo or real)
- ✅ Execute trades automatically when trigger conditions are met
- ✅ Buy/sell contracts via Deriv API
- ✅ Monitor positions and close them when stop loss/target is hit

## Important Notes

### Deriv vs MT5
- **Deriv** = Deriv's proprietary trading platform (what we're implementing)
- **MT5** = MetaTrader 5 (separate platform, requires different API)
- You **cannot** use MT5 accounts with Deriv API
- If you need MT5 trading, you need a separate MT5 API integration

### Account Types
- **Demo Account:** For testing, no real money
- **Real Account:** Real money trading
- **Always test with demo first!**

---

## Step 1: Get Deriv API Token

1. **Go to Deriv Dashboard:**
   - Visit https://app.deriv.com/account/api-token
   - Log in with your Deriv account

2. **Create API Token:**
   - Click "Create new token"
   - Name it (e.g., "Autotrading Bot")
   - Select scopes:
     - ✅ **Read** - Required for account info
     - ✅ **Trading Information** - Required for trading
   - Click "Create"

3. **Copy the Token:**
   - Copy the token immediately (you won't see it again)
   - Store it securely

---

## Step 2: Run Database Migration

Run the migration to add trading fields:

```bash
# If using Supabase CLI
supabase migration up

# Or run the SQL file directly in Supabase dashboard
# File: supabase/migrations/008_deriv_trading.sql
```

This adds:
- `api_token` field to `deriv_accounts` table
- Contract tracking fields to `trades` table
- Indexes for performance

---

## Step 3: Add Deriv Account with API Token

### Option A: Via Settings Page (Recommended)

1. Go to `/settings` page
2. Click "Add New Trading Account"
3. Select "Deriv" tab
4. Fill in:
   - **Account Name:** "My Deriv Demo" (or "My Deriv Real")
   - **Broker:** "Deriv"
   - **Server:** "demo" (or "real")
   - **Login ID:** Your Deriv account login ID
   - **Password:** (optional, used for account info only)
   - **Account Type:** "demo" or "real"
   - **API Token:** Paste your API token here ⚠️

5. Click "Add Account"

### Option B: Via API

```bash
POST /api/deriv/auth
Content-Type: application/json

{
  "account_name": "My Deriv Demo",
  "broker": "Deriv",
  "server": "demo",
  "login_id": "your_login_id",
  "password": "your_password",
  "account_type": "demo",
  "api_token": "your_api_token_here"
}
```

---

## Step 4: Configure Trading Parameters

### Contract Duration
Default is **5 minutes**. To change:

Edit `app/api/trades/monitor/route.ts`:
```typescript
duration: 5, // Change this value
duration_unit: 'm', // 's' = seconds, 'm' = minutes, 'h' = hours
```

### Contract Types
The system automatically determines contract type:
- **Synthetic Indices** (R_50, BOOM, CRASH, etc.) → `RISE`/`FALL`
- **Forex/Commodities** → `CALL`/`PUT`

---

## Step 5: Test with Demo Account

### 1. Create a Test Trade

```javascript
// In browser console or via API
fetch('/api/trades/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    setups: [{
      type: 'bullish',
      entryZone: '1.08500',
      stopLoss: '1.08000',
      target: '1.09000',
      trigger: 'Break above 1.08500'
    }],
    symbol: 'EURUSD',
    lot_size: 1, // Small amount for testing
    number_of_positions: 1
  })
})
```

### 2. Monitor Trade Execution

The system will:
1. Check trigger conditions every time `/api/trades/monitor` is called
2. When triggered, buy a contract via Deriv API
3. Store contract ID in database
4. Monitor contract status
5. Close contract when stop loss/target is hit

### 3. Check Trade Status

```javascript
// Get all trades
fetch('/api/trades')
  .then(r => r.json())
  .then(console.log);
```

---

## Step 6: Set Up Automatic Monitoring

### Option A: Cron Job (Recommended)

Set up a cron job to call the monitor endpoint every 10-30 seconds:

```bash
# Using cron
*/10 * * * * curl -X POST http://localhost:3000/api/trades/monitor
```

### Option B: Vercel Cron (If using Vercel)

Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/trades/monitor",
    "schedule": "*/10 * * * * *"
  }]
}
```

### Option C: Background Worker

Create a background service that continuously monitors trades.

---

## How It Works

### Trade Flow

1. **Create Trade** (`POST /api/trades/create`)
   - Creates trade record with status "pending"
   - Stores trigger conditions

2. **Monitor** (`POST /api/trades/monitor`)
   - Checks all pending trades
   - When trigger condition met:
     - Gets contract proposal from Deriv
     - Buys contract
     - Updates trade status to "active"
     - Stores contract ID

3. **Monitor Active Trades**
   - Updates PNL in real-time
   - Checks stop loss/target
   - When hit:
     - Sells contract via Deriv API
     - Updates trade status to "closed"
     - Records profit/loss

### Contract Execution

When a trade is triggered:
```typescript
// 1. Get proposal
const proposal = await getContractProposal({
  amount: 10, // Stake amount
  basis: 'stake',
  contract_type: 'CALL', // or 'PUT', 'RISE', 'FALL'
  currency: 'USD',
  duration: 5,
  duration_unit: 'm',
  symbol: 'EURUSD'
});

// 2. Buy contract
const contract = await buyContract(
  proposal.proposal.id,
  proposal.proposal.ask_price
);

// 3. Store contract ID
// Contract ID is stored in trade.contract_id
```

### Contract Closing

When stop loss/target is hit:
```typescript
// Sell contract
const sellResult = await sellContract(contractId, 0); // 0 = market price

// Update trade
// PNL is calculated from sell result
```

---

## Security Considerations

### ⚠️ API Token Security

**Current Implementation:**
- API tokens are stored in database
- ⚠️ **NOT ENCRYPTED** (for now)

**Recommended:**
1. Encrypt tokens before storing
2. Use environment variables for encryption keys
3. Never return tokens in API responses
4. Rotate tokens periodically

### Risk Management

1. **Set Daily Loss Limits**
   - Add to your trading logic
   - Stop trading if daily loss exceeds limit

2. **Position Sizing**
   - Use small lot sizes for testing
   - Gradually increase after validation

3. **Cooldown Periods**
   - Already implemented
   - Prevents overtrading after losses

---

## Troubleshooting

### "No API token for account"
- Make sure you added the API token when creating the account
- Check that `api_token` field exists in database

### "Failed to buy contract"
- Check account balance
- Verify API token has "Trading Information" scope
- Check symbol is valid for Deriv

### "Contract not found"
- Contract may have expired
- Check contract_id is correct
- Verify contract is still active

### Contracts Not Executing
- Check trigger conditions are being met
- Verify monitor endpoint is being called
- Check for cooldown periods
- Review trade logs for errors

---

## Monitoring & Logs

### View Trade Logs

```sql
SELECT * FROM trade_logs 
WHERE trade_id = 'your-trade-id'
ORDER BY created_at DESC;
```

### Check Active Contracts

```sql
SELECT * FROM trades 
WHERE status = 'active' 
AND contract_id IS NOT NULL;
```

### View Account Status

```sql
SELECT account_name, balance, currency, is_selected 
FROM deriv_accounts 
WHERE user_id = 'your-user-id';
```

---

## Next Steps

1. ✅ Test with demo account
2. ✅ Verify contracts are being executed
3. ✅ Monitor PNL and close positions
4. ✅ Add encryption for API tokens
5. ✅ Implement risk management rules
6. ✅ Set up production monitoring
7. ✅ Test with real account (small amounts)

---

## API Reference

### Trading Functions

Located in `lib/api/deriv.ts`:

- `getContractProposal(params)` - Get contract proposal
- `buyContract(proposalId, price)` - Buy contract
- `sellContract(contractId, price)` - Sell contract
- `getPortfolio()` - Get active contracts
- `getContractInfo(contractId)` - Get contract details
- `getContractType(symbol, direction)` - Determine contract type

### Endpoints

- `POST /api/trades/create` - Create trade
- `POST /api/trades/monitor` - Monitor and execute trades
- `GET /api/trades` - Get all trades
- `POST /api/deriv/auth` - Add/update Deriv account

---

## Support

- [Deriv API Documentation](https://developers.deriv.com/)
- [Deriv Trading APIs](https://developers.deriv.com/docs/trading-apis)
- [Deriv WebSocket Guide](https://api.deriv.com/docs/core-concepts/websocket/)

---

## Important Reminders

1. ⚠️ **Always test with demo account first**
2. ⚠️ **Start with small amounts**
3. ⚠️ **Monitor trades closely**
4. ⚠️ **Set stop losses**
5. ⚠️ **Don't risk more than you can afford to lose**

Good luck with your autotrading! 🚀
