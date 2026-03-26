import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy /api/* to the NestJS backend container in production.
  // In dev, NEXT_PUBLIC_API_URL=http://localhost:3001 makes the browser call
  // the API directly, so rewrites are never triggered.
  async rewrites() {
    const apiBase = process.env.INTERNAL_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
