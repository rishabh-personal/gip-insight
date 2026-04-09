import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'gip_auth';
const SESSION_DAYS = 30;

// ── HMAC helpers (Node.js crypto — available in route handlers) ───────────────

async function createToken(secret: string): Promise<string> {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const data = String(expiry);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${expiry}.${sigHex}`;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { username, password } = await request.json().catch(() => ({}));

  const validUser = process.env.DASHBOARD_USERNAME;
  const validPass = process.env.DASHBOARD_PASSWORD;
  const secret    = process.env.AUTH_SECRET;

  if (!validUser || !validPass || !secret) {
    return NextResponse.json({ error: 'Auth not configured on server' }, { status: 500 });
  }

  const usernameMatch = username === validUser;
  const passwordMatch = password === validPass;

  if (!usernameMatch || !passwordMatch) {
    // Constant-time-ish: always compute token even on failure to avoid timing leaks
    await createToken(secret);
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await createToken(secret);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: '/',
  });
  return response;
}
