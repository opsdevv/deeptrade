# ICT/SMC 2-Day Scalping Analysis Framework

A Next.js TypeScript application that implements a machine-friendly ICT/SMC analysis engine for 2-day scalping analysis.

## Features

- **Multi-Timeframe Analysis**: 2H (bias), 15m (liquidity), 5m (execution)
- **ICT Concepts**: FVG detection, MSS identification, displacement, liquidity sweeps, premium/discount
- **Chart Visualization**: Interactive price charts with ICT drawings
- **DeepSeek Integration**: AI-powered analysis prompts
- **Supabase Integration**: Data persistence and history tracking
- **Deriv API**: Market data fetching

## Tech Stack

- Next.js 14+ (App Router)
- TypeScript
- Supabase (PostgreSQL)
- TradingView Lightweight Charts
- DeepSeek API
- Deriv API

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env.local`:
```env
DEEPSEEK_API_KEY=your_key
DERIV_API_KEY=your_api_token
DERIV_APP_ID=your_app_id
DERIV_WS_URL=wss://ws.derivws.com/websockets/v3
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key
```

**Deriv API Setup:**
- Get your API token from [Deriv API Token Manager](https://app.deriv.com/account/api-token)
- Register your app at [Deriv API Dashboard](https://api.deriv.com/) to get your App ID
- The token should have "Read" and "Trading Information" scopes for market data
- Default WebSocket URL is `wss://ws.derivws.com/websockets/v3` (production) or `wss://ws.binaryws.com/websockets/v3` (test)

3. Set up Supabase database:
   - Run the migration in `supabase/migrations/001_initial_schema.sql`

4. Run the development server:
```bash
npm run dev
```

## Project Structure

```
deepanalysis/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   └── (dashboard)/       # Dashboard pages
├── components/            # React components
│   ├── charts/           # Chart components
│   └── analysis/        # Analysis components
├── lib/                  # Core logic
│   ├── analysis/         # Analysis engines
│   ├── ict/             # ICT concept implementations
│   ├── api/              # API clients
│   └── supabase/         # Supabase client
├── types/                # TypeScript definitions
└── supabase/             # Database migrations
```

## Usage

1. **Run Analysis**: Select an instrument and run analysis from the dashboard
2. **View Results**: See detailed analysis with charts and drawings
3. **Generate Prompts**: Create DeepSeek prompts from analysis results

## Analysis Flow

1. **2H Analysis**: Determines bias, range, liquidity pools, FVGs
2. **15m Analysis**: Validates liquidity sweeps and setup
3. **5m Analysis**: Generates execution signals with entry/stop/target
4. **Session Filter**: Validates trading session timing
5. **Final Decision**: NO_TRADE, WATCH, or TRADE_SETUP

## Supported Instruments

- Volatility 50 (V50)
- XAUUSD
- GBPJPY
- GBPUSD

## License

MIT
