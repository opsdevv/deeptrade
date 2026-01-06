// Supabase Client - Database operations only (no authentication)

import { createClient } from '@supabase/supabase-js';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client-side Supabase client for database operations
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Server-side client for API routes (with cookie handling for authentication)
// Uses Next.js cookies() helper which is the recommended approach for App Router API routes
export function createServerClient() {
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:20',message:'Creating SSR client with Next.js cookies()',data:{hasSupabaseUrl:!!supabaseUrl,hasSupabaseAnonKey:!!supabaseAnonKey},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
  // #endregion

  return createSSRServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        try {
          const cookieStore = cookies();
          const allCookies = cookieStore.getAll();
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:30',message:'Reading cookies via cookies() helper',data:{cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name),hasSupabaseAuthCookies:allCookies.some(c=>c.name.includes('sb-')||c.name.includes('supabase')||c.name.includes('auth'))},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
          // #endregion
          return allCookies;
        } catch (error: any) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:35',message:'Error reading cookies',data:{error:error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
          // #endregion
          return [];
        }
      },
      setAll(cookiesToSet) {
        try {
          const cookieStore = cookies();
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:43',message:'Setting cookies via cookies() helper',data:{cookieCount:cookiesToSet.length,cookieNames:cookiesToSet.map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
          // #endregion
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error: any) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/supabase/client.ts:50',message:'Error setting cookies',data:{error:error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
          // #endregion
          // Cookie setting might fail in some contexts, ignore silently
        }
      },
    },
  });
}
