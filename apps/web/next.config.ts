import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Always proxy /api/* through Next.js so no CORS or NEXT_PUBLIC_API_URL config
  // is needed. next.config.ts is evaluated at build time, so NODE_ENV (which
  // Next.js sets to "production" during `next build`) selects the right target:
  //   production → Docker service name (gip-api) resolved by Docker DNS
  //   development → localhost where the NestJS dev server runs
  async rewrites() {
    const apiBase =
      process.env.NODE_ENV === 'production'
        ? 'http://gip-api:3001'
        : 'http://localhost:3001';
    return [
      // Proxy only NestJS routes — /api/auth/* is handled locally by Next.js
      // route handlers and must NOT be forwarded to the backend.
      {
        source: '/api/dashboard/:path*',
        destination: `${apiBase}/api/dashboard/:path*`,
      },
      {
        source: '/api/health',
        destination: `${apiBase}/api/health`,
      },
    ];
  },
};

export default nextConfig;
