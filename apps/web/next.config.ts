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
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
