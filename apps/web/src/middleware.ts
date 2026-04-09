import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't need authentication
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/_next', '/favicon.ico'];

// ── HMAC helpers (Web Crypto — Edge runtime compatible) ───────────────────────

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) ?? [];
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return false;

    const expiryStr = token.slice(0, dot);
    const sigHex = token.slice(dot + 1);

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return false;

    const key = await getKey(secret);
    const sigBytes = hexToBytes(sigHex).buffer as ArrayBuffer;
    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(expiryStr),
    );
  } catch {
    return false;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('gip_auth')?.value;
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    // AUTH_SECRET not configured — allow through so devs can work without auth
    return NextResponse.next();
  }

  if (token && (await verifyToken(token, secret))) {
    return NextResponse.next();
  }

  // Not authenticated → redirect to login, preserving the intended URL
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
