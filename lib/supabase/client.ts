// Supabase Client

import { createClient } from '@supabase/supabase-js';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client-side Supabase client - must use cookies for server-side access
// Create client with fallback values for build time (will error at runtime if missing)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Use cookies for cross-domain and server-side access
      flowType: 'pkce',
    },
  }
);

// Server-side client that properly handles cookies for authentication
// For API routes (Route Handlers), pass request and response
export function createServerClient(request?: NextRequest, response?: NextResponse) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:18',message:'createServerClient called',data:{hasRequest:!!request,hasResponse:!!response,hasAnonKey:!!supabaseAnonKey,hasSupabaseUrl:!!supabaseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  // If request and response are provided (API routes), use SSR client with cookies
  if (request && response) {
    // #region agent log
    const allCookies = request.cookies.getAll();
    const cookieHeader = request.headers.get('cookie');
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:42',message:'Reading cookies from request',data:{cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name),hasCookieHeader:!!cookieHeader,cookieHeaderLength:cookieHeader?.length||0,hasSupabaseCookies:allCookies.some(c=>c.name.includes('supabase')||c.name.includes('sb-'))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    const client = createSSRServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll: () => {
            const cookies = request.cookies.getAll();
            // #region agent log
            const supabaseCookies = cookies.filter(c => c.name.includes('supabase') || c.name.includes('sb-'));
            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:52',message:'getAll cookies called by SSR client',data:{cookieCount:cookies.length,cookieNames:cookies.map(c=>c.name),cookieValues:cookies.map(c=>c.value.substring(0,50)+'...'),supabaseCookieCount:supabaseCookies.length,supabaseCookieNames:supabaseCookies.map(c=>c.name),firstSupabaseCookieValuePrefix:supabaseCookies[0]?.value?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            // Check if cookie value has base64- prefix and decode if needed
            return cookies.map(cookie => {
              let value = cookie.value;
              // If cookie value starts with "base64-", decode it
              if (value.startsWith('base64-')) {
                try {
                  // #region agent log
                  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:60',message:'Decoding base64- prefixed cookie',data:{cookieName:cookie.name,originalValuePrefix:value.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
                  // #endregion
                  value = Buffer.from(value.substring(7), 'base64').toString('utf-8');
                  // #region agent log
                  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:65',message:'Cookie decoded successfully',data:{cookieName:cookie.name,decodedValuePrefix:value.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
                  // #endregion
                } catch (e) {
                  // #region agent log
                  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:70',message:'Failed to decode base64 cookie',data:{cookieName:cookie.name,error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
                  // #endregion
                }
              }
              return {
                name: cookie.name,
                value: value,
              };
            });
          },
          setAll: (cookiesToSet) => {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:50',message:'setAll cookies called',data:{cookieCount:cookiesToSet.length,cookieNames:cookiesToSet.map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:45',message:'createServerClient returning SSR client with cookies',data:{clientCreated:!!client},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return client;
  }

  // Fallback: create client without cookies (for backward compatibility)
  // This won't work for getUser() but may be needed for some operations
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:58',message:'createServerClient returning fallback client without cookies',data:{clientCreated:!!client},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return client;
}
