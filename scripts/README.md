# Scripts

## Fix Instrument Symbols

This script/API endpoint helps you check and fix instrument symbols in your Supabase database to ensure they use the proper Deriv format.

### Using the API Endpoint

1. **Check instruments (dry run)** - See what needs to be fixed:
   ```bash
   curl http://localhost:3000/api/instruments/fix-symbols
   ```
   
   Or open in browser: `http://localhost:3000/api/instruments/fix-symbols`

2. **Fix instruments** - Actually update the symbols:
   ```bash
   curl -X POST http://localhost:3000/api/instruments/fix-symbols \
     -H "Content-Type: application/json" \
     -d '{"dryRun": false}'
   ```

### What it does

The script checks all instruments in your Supabase database and:
- ✅ Identifies symbols that don't match Deriv's expected format
- 🔧 Fixes common issues like:
  - Forex pairs missing `frx` prefix (e.g., `EURUSD` → `frxEURUSD`)
  - Commodities missing `frx` prefix (e.g., `XAUUSD` → `frxXAUUSD`)
  - Volatility indices using wrong format (e.g., `V50` → `R_50`)
  - Case inconsistencies (e.g., `eurusd` → `frxEURUSD`)

### Symbol Format Rules

- **Forex pairs**: Must have `frx` prefix (e.g., `frxEURUSD`, `frxGBPUSD`)
- **Commodities**: Must have `frx` prefix (e.g., `frxXAUUSD`, `frxXAGUSD`)
- **Volatility indices**: Use `R_` format (e.g., `R_50`, `R_75`, `R_100`)
- **Synthetic indices**: Keep as-is (e.g., `CRASH300N`, `BOOM500`, `JD50`)
- **Stock indices**: Keep as-is (e.g., `OTC_NDX`, `US_100`, `FTSE_100`)
- **Cryptocurrencies**: Keep as-is (e.g., `CRYBTCUSD`, `CRYETHUSD`)

### Example Output

```json
{
  "success": true,
  "message": "Checked 15 instruments. Found 3 that need fixing.",
  "checked": 15,
  "correct": 12,
  "issues": 3,
  "details": {
    "issues": [
      {
        "id": "uuid-1",
        "current": "EURUSD",
        "corrected": "frxEURUSD",
        "type": "forex"
      },
      {
        "id": "uuid-2",
        "current": "XAUUSD",
        "corrected": "frxXAUUSD",
        "type": "forex"
      },
      {
        "id": "uuid-3",
        "current": "V50",
        "corrected": "R_50",
        "type": "volatility"
      }
    ]
  }
}
```
