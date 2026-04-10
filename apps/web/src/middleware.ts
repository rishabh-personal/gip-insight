import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that never need authentication
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/_next', '/favicon.ico'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;

  // If AUTH_SECRET is not configured, allow all traffic (local dev without auth)
  if (!secret) return NextResponse.next();

  const cookie = request.cookies.get('gip_auth')?.value;

  if (cookie === secret) return NextResponse.next();

  // Not authenticated — redirect to login, preserving the intended path
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
