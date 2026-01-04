'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Ensure component is mounted on client to prevent hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if already logged in OR after successful login
  useEffect(() => {
    // Get URL params once for use in both logging and logic
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasRedirectParam = urlParams?.has('redirect');
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:24',message:'Redirect useEffect triggered',data:{mounted,authLoading,hasUser:!!user,loginSuccess,currentPath:typeof window !== 'undefined' ? window.location.pathname : 'N/A',hasRedirectParam},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
    // #endregion
    
    if (!mounted || authLoading) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:27',message:'Redirect useEffect early return',data:{reason:!mounted ? 'not mounted' : 'auth loading'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    // CRITICAL FIX: If we have a redirect parameter, it means middleware just sent us here
    // because it couldn't verify the session. Don't redirect back based on client-side auth
    // state alone - this prevents the redirect loop. Only redirect if user explicitly logged in.
    if (urlParams && urlParams.has('redirect')) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:43',message:'Has redirect param, preventing auto-redirect to avoid loop',data:{redirectParam:urlParams.get('redirect'),hasUser:!!user,loginSuccess},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
      // Don't auto-redirect when middleware sent us here - wait for explicit login
      // The redirect will happen in handleSubmit after successful login
      return;
    }
    
    // Only redirect if we're still on the login page AND user is authenticated
    // AND we don't have a redirect parameter (which would indicate middleware sent us here)
    if ((user || loginSuccess) && window.location.pathname === '/login') {
      // Always redirect to /chat after login
      // Use window.location.replace for hard redirect to ensure cookies are sent
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:53',message:'User authenticated, redirecting to /chat using window.location.replace',data:{hasUser:!!user,loginSuccess,currentPath:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      window.location.replace('/chat');
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:57',message:'Redirect condition not met',data:{hasUser:!!user,loginSuccess,currentPath:window.location.pathname,conditionMet:(user || loginSuccess) && window.location.pathname === '/login'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
    }
  }, [user, authLoading, loginSuccess, router, mounted]);

  // Debug: Log error state changes
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:34',message:'Error state changed',data:{error,hasError:!!error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }, [error]);

  // Handle redirect after login - always go to /chat
  const getRedirectPath = () => {
    // Always redirect to /chat after login, ignoring any redirect query parameter
    const finalPath = '/chat';
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:44',message:'getRedirectPath called',data:{finalPath,windowLocation:typeof window !== 'undefined' ? window.location.href : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return finalPath;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:37',message:'handleSubmit called',data:{email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:43',message:'Before signInWithPassword',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:50',message:'After signInWithPassword',data:{hasError:!!signInError,errorMessage:signInError?.message,hasUser:!!data?.user,hasSession:!!data?.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion

      if (signInError) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:53',message:'SignInError detected',data:{errorMessage:signInError.message,errorStatus:signInError.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Set user-friendly error message
        let errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        const errorMsgLower = signInError.message.toLowerCase();
        if (errorMsgLower.includes('email not confirmed') || errorMsgLower.includes('email_not_confirmed')) {
          errorMessage = 'Please verify your email address before signing in.';
        } else if (errorMsgLower.includes('invalid login credentials') || errorMsgLower.includes('invalid_credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        }
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:80',message:'Setting error message',data:{errorMessage,originalError:signInError.message,errorStatus:signInError.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        setError(errorMessage);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:85',message:'Error state set, returning',data:{errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return;
      }

      if (data.user && data.session) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:58',message:'User and session exist, getting session',data:{userId:data.user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        // Ensure session is established before redirecting
        const sessionResult = await supabase.auth.getSession();
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:63',message:'Session retrieved',data:{hasSession:!!sessionResult.data.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:148',message:'Login successful, preparing redirect',data:{userId:data.user.id,hasSession:!!data.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
        // #endregion

        // Get redirect path - use the redirect param if it exists, otherwise go to /chat
        const redirectParam = new URLSearchParams(window.location.search).get('redirect');
        const redirectPath = redirectParam || '/chat';
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:152',message:'About to redirect after login',data:{redirectPath,redirectParam,hasSession:!!sessionResult.data.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
        // #endregion
        
        // Wait a moment for Supabase to sync session to cookies
        // The client-side client uses localStorage, but middleware needs cookies
        // A small delay ensures cookies are set before redirect
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:158',message:'Executing redirect after delay',data:{redirectPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
        // #endregion
        
        // Use replace to avoid adding to history and ensure cookies are sent
        window.location.replace(redirectPath);
        
        return;
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:74',message:'User or session missing',data:{hasUser:!!data?.user,hasSession:!!data?.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        setError('An unexpected error occurred. Please try again.');
      }
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:78',message:'Exception caught',data:{errorMessage:err?.message,errorName:err?.name,errorStack:err?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:84',message:'handleSubmit finally block',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
      // #endregion
    }
  };

  // Prevent hydration mismatch by not rendering form until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 items-center justify-center p-12">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-white mb-4">DeepAnalysis</h1>
            <p className="text-blue-100 text-lg">
              Advanced Trading Analysis Platform
            </p>
          </div>
        </div>
        <div className="w-full md:w-1/2 flex items-center justify-center p-4 md:p-12">
          <div className="max-w-md w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">DeepAnalysis</h1>
              <p className="text-gray-400">
                Sign in to your account
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
      {/* Image/Visual Side */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}></div>
        </div>
        <div className="relative z-10 text-center">
          <h1 className="text-5xl font-bold text-white mb-4">DeepAnalysis</h1>
          <p className="text-blue-100 text-lg mb-6">
            Advanced Trading Analysis Platform
          </p>
          <p className="text-blue-200 text-sm max-w-md">
            Leverage the power of ICT/SMC concepts for professional trading analysis
          </p>
        </div>
      </div>

      {/* Login Form Side */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-4 md:p-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-8 md:hidden">
            <h1 className="text-3xl font-bold text-white mb-2">DeepAnalysis</h1>
            <p className="text-gray-400">
              Sign in to your account
            </p>
          </div>
          <div className="hidden md:block mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-gray-400">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" method="post" autoComplete="on">
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                suppressHydrationWarning
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition"
              suppressHydrationWarning
            >
              {loading ? 'Loading...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
