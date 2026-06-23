import { describe, expect, it } from 'vitest';

import { buildRankingOgPreviewUrl } from './ranking-og-preview-url';

describe('buildRankingOgPreviewUrl', () => {
  it('builds personal preview URLs with cache-busting version params', () => {
    expect(
      buildRankingOgPreviewUrl('https://geobrowser.io', {
        scope: 'personal',
        rankEntityId: 'rank-1',
        authorSpaceId: 'author-1',
        blockEntityId: 'block-1',
        blockEntitySpaceId: 'space-1',
        rankingStartDate: '2026-06-01',
        rankingEndDate: '2026-06-30',
        ogVersion: 'ranking-og-v1-abc123',
      })
    ).toBe(
      'https://geobrowser.io/api/ranking-og/preview?scope=personal&blockEntityId=block-1&blockEntitySpaceId=space-1&rankingStartDate=2026-06-01&rankingEndDate=2026-06-30&rankEntityId=rank-1&authorSpaceId=author-1&ogVersion=ranking-og-v1-abc123'
    );
  });

  it('builds global preview URLs', () => {
    expect(
      buildRankingOgPreviewUrl('https://geobrowser.io', {
        scope: 'global',
        blockEntityId: 'block-1',
        blockEntitySpaceId: 'space-1',
        globalOgVersion: 'ranking-global-og-v1-abc123',
      })
    ).toBe(
      'https://geobrowser.io/api/ranking-og/preview?scope=global&blockEntityId=block-1&blockEntitySpaceId=space-1&globalOgVersion=ranking-global-og-v1-abc123'
    );
  });
});
