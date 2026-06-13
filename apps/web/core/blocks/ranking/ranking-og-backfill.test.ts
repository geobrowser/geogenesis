import { describe, expect, it } from 'vitest';

import { buildRankingOgBackfillPlan, parseRankingOgVariants } from './ranking-og-backfill';

describe('ranking OG backfill helpers', () => {
  it('parses and dedupes variants', () => {
    expect(parseRankingOgVariants('story,landscape,story')).toEqual(['story', 'landscape']);
  });

  it('dedupes rank/version/variant items', () => {
    const plan = buildRankingOgBackfillPlan({
      publicBaseUrl: 'https://img.example.com',
      variants: ['landscape'],
      inputs: [
        {
          rankEntityId: 'rank-1',
          authorSpaceId: 'author-1',
          blockEntityId: 'block-1',
          blockEntitySpaceId: 'space-1',
          ogVersion: 'v1',
        },
        {
          rankEntityId: 'rank-1',
          authorSpaceId: 'author-1',
          blockEntityId: 'block-1',
          blockEntitySpaceId: 'space-1',
          ogVersion: 'v1',
        },
      ],
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.key).toBe('og/rankings/rank-1/v1/landscape.png');
  });
});
