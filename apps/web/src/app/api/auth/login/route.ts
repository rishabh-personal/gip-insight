import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'gip_auth';
const SESSION_DAYS = 30;

export async function POST(request: NextRequest) {
  const { username, password } = await request.json().catch(() => ({}));

  const validUser = process.env.DASHBOARD_USERNAME;
  const validPass = process.env.DASHBOARD_PASSWORD;
  const secret    = process.env.AUTH_SECRET;

  if (!validUser || !validPass || !secret) {
    return NextResponse.json({ error: 'Auth not configured on server' }, { status: 500 });
  }

  if (username !== validUser || password !== validPass) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  // Cookie value = AUTH_SECRET (httpOnly — never visible to client-side JS)
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: '/',
  });
  return response;
}
