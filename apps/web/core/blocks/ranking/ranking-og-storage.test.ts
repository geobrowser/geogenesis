import { describe, expect, it } from 'vitest';

import {
  RANKING_OG_VARIANT_SIZES,
  RankingOgStorageConfigError,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgPublicBaseUrl,
  getRankingOgStorageConfig,
  normalizeRankingOgKeyPart,
} from './ranking-og-storage';

describe('ranking OG storage helpers', () => {
  it('uses high-density output dimensions for generated variants', () => {
    expect(RANKING_OG_VARIANT_SIZES).toEqual({
      landscape: { width: 2400, height: 1260 },
      story: { width: 1080, height: 1920 },
    });
  });

  it('normalizes key path parts', () => {
    expect(normalizeRankingOgKeyPart('../rank/id')).toBe('..-rank-id');
  });

  it('builds variant-specific immutable object keys', () => {
    expect(
      buildRankingOgObjectKey({
        rankEntityId: 'rank-1',
        version: 'ranking-og-v1-abc123',
        variant: 'landscape',
      })
    ).toBe('og/rankings/rank-1/ranking-og-v1-abc123/landscape.png');
  });

  it('builds public CDN URLs', () => {
    expect(buildRankingOgPublicUrl('https://img.example.com/', 'og/rankings/rank 1/v1/story.png')).toBe(
      'https://img.example.com/og/rankings/rank%201/v1/story.png'
    );
  });

  it('returns null for a missing or invalid public base URL', () => {
    expect(getRankingOgPublicBaseUrl({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      getRankingOgPublicBaseUrl({ CLOUDFLARE_R2_PUBLIC_BASE_URL: 'bad' } as unknown as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it('throws a typed error when required R2 env is missing', () => {
    expect(() => getRankingOgStorageConfig({} as NodeJS.ProcessEnv)).toThrow(RankingOgStorageConfigError);
  });
});
