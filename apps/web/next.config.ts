import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy /api/* to the NestJS backend container in production.
  // next.config.ts is evaluated at build time, so we use NODE_ENV (which Next.js
  // always sets to "production" during `next build`) to bake in the correct
  // Docker service hostname. In dev, no rewrites are needed because the browser
  // calls the API directly via NEXT_PUBLIC_API_URL=http://localhost:3001.
  async rewrites() {
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://gip-api:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
