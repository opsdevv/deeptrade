# Vercel Deployment Guide

This document outlines the fixes applied for Vercel deployment and important configuration steps.

## Critical Fixes Applied

### 1. File Upload Storage ✅
- **Issue**: Vercel's filesystem is read-only (except `/tmp` which is ephemeral)
- **Fix**: Migrated file uploads to Supabase Storage
- **Action Required**: 
  - Create a storage bucket named `uploads` in your Supabase project
  - Set bucket to public or configure RLS policies as needed
  - The bucket should have a folder structure: `uploads/screenshots/`

### 2. API Route Timeouts ✅
- **Issue**: Long-running operations could timeout (default 10s Hobby, 60s Pro)
- **Fix**: Added `export const maxDuration = 60` to:
  - `/api/analysis` - Analysis operations
  - `/api/data` - Market data fetching
  - `/api/deepseek` - External API calls
  - `/api/chat` - Chat operations
  - `/api/chat/upload` - File uploads
- **Note**: Pro plan required for 60s timeout. Hobby plan limited to 10s.

### 3. Environment Variables ✅
- **Issue**: Hardcoded default values could cause production issues
- **Fix**: Removed hardcoded defaults from:
  - `lib/api/deriv.ts` - Now requires all env vars
  - `lib/redis/client.ts` - Graceful degradation if not configured
- **Action Required**: Set ALL environment variables in Vercel dashboard

### 4. Redis Connection Handling ✅
- **Issue**: Serverless functions need faster connection timeouts
- **Fix**: 
  - Added 5-second connection timeout
  - Reduced retry attempts for serverless
  - Graceful degradation if Redis not configured

## Required Environment Variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

### Required:
```
DEEPSEEK_API_KEY=your_key
DERIV_API_KEY=your_api_token
DERIV_APP_ID=your_app_id
DERIV_WS_URL=wss://ws.derivws.com/websockets/v3
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Optional (for Redis caching):
```
REDIS_USERNAME=default
REDIS_PASSWORD=your_redis_password
REDIS_HOST=your_redis_host
REDIS_PORT=14502
```

## Known Limitations

### WebSocket Connections ⚠️
**Critical**: Vercel serverless functions do NOT support persistent WebSocket connections.

**Current Status**: The Deriv API client (`lib/api/deriv.ts`) uses WebSocket connections which will NOT work in Vercel serverless functions.

**Impact**: 
- Market data fetching via WebSocket will fail
- Real-time price updates will not work

**Solutions**:
1. **Recommended**: Use Deriv HTTP REST API endpoints instead of WebSocket
2. **Alternative**: Move WebSocket logic to a separate service (e.g., Railway, Render, or a dedicated WebSocket server)
3. **Workaround**: Use client-side WebSocket connections (browser → Deriv directly)

**Action Required**: 
- Refactor `lib/api/deriv.ts` to use HTTP endpoints, OR
- Document that WebSocket features require a different deployment strategy

## Supabase Storage Setup

1. Go to your Supabase project dashboard
2. Navigate to Storage
3. Create a new bucket named `uploads`
4. Set bucket to public (or configure RLS policies)
5. Create folder structure: `uploads/screenshots/`

## Database Migrations

Run Supabase migrations manually:
1. Go to Supabase SQL Editor
2. Run each migration file from `supabase/migrations/` in order
3. Or use Supabase CLI: `supabase db push`

## Build Configuration

The project uses:
- Next.js 16.1.1
- TypeScript
- Node.js (Vercel auto-detects)

Build command: `npm run build` (configured in `vercel.json`)

## Testing Deployment

After deployment, test:
1. ✅ File uploads (should use Supabase Storage)
2. ✅ Analysis API endpoints
3. ✅ Market data fetching (may fail if WebSocket not refactored)
4. ✅ Redis caching (should degrade gracefully if not configured)
5. ✅ Supabase database operations

## Troubleshooting

### Build Fails
- Check TypeScript errors: `npm run build` locally
- Verify all environment variables are set

### Timeout Errors
- Upgrade to Vercel Pro for 60s timeout
- Or optimize slow operations

### File Upload Fails
- Verify Supabase Storage bucket exists
- Check bucket permissions
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set

### Redis Connection Errors
- Redis is optional - app should work without it
- Check Redis credentials if caching is needed

### WebSocket Errors
- Expected in serverless - see "Known Limitations" above
- Refactor to HTTP endpoints or use separate service
