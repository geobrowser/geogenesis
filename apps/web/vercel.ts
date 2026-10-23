import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    {
      path: '/api/debates/publish-sweep',
      schedule: '*/5 * * * *',
    },
    {
      // GEO-2870: debate claims onto the graph minutes after extraction, ahead of the debate.
      path: '/api/debates/publish-claims-sweep',
      schedule: '* * * * *',
    },
    {
      // GEO-3308: rebuild the shared Explore Fresh list so no visitor waits on the gaia query.
      path: '/api/explore/warm-fresh-list',
      schedule: '* * * * *',
    },
  ],
};
