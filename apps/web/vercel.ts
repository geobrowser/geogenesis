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
  ],
};
