import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Allow all requests through - no authentication required
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except Next.js internals and static files.
     */
    '/((?!_next|api|favicon\\.ico|_vercel|__nextjs).*)',
  ],
};
