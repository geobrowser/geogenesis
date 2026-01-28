import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  rewrites: [
    {
      source: '/preview/:path*',
      destination: 'https://geobrowser.io/api/og?hash=:path*',
    },
  ],
};
