'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import TradingChatbot from '@/components/chat/TradingChatbot';

export default function ChatPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Log when chat page is reached
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/chat/page.tsx:13',message:'Chat page mounted',data:{currentPath:window.location.pathname,currentHref:window.location.href,hasUser:!!user,loading:authLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
    // #endregion
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/9579e514-688e-48af-b237-1ebae4332d37',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/chat/page.tsx:20',message:'Redirecting from chat to login (no user)',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      router.push('/login?redirect=/chat');
    }
  }, [user, authLoading, router]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <TradingChatbot />
    </div>
  );
}
