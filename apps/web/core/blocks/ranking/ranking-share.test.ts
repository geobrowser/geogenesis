import { describe, expect, it } from 'vitest';

import { buildShortGlobalRankingSharePath, buildShortPersonalRankingSharePath } from './ranking-share';

describe('buildShortPersonalRankingSharePath', () => {
  it('returns the bare path when no version is provided', () => {
    expect(buildShortPersonalRankingSharePath('rank-1')).toBe('/r/rank-1');
  });

  it('appends a content-hash cache-buster so X re-scrapes changed rankings', () => {
    expect(buildShortPersonalRankingSharePath('rank-1', 'ranking-og-v3-abc123')).toBe(
      '/r/rank-1?v=ranking-og-v3-abc123'
    );
  });

  it('ignores empty/whitespace versions', () => {
    expect(buildShortPersonalRankingSharePath('rank-1', '')).toBe('/r/rank-1');
    expect(buildShortPersonalRankingSharePath('rank-1', '   ')).toBe('/r/rank-1');
  });

  it('URL-encodes the version param', () => {
    expect(buildShortPersonalRankingSharePath('rank-1', 'a b&c')).toBe('/r/rank-1?v=a%20b%26c');
  });
});

describe('buildShortGlobalRankingSharePath', () => {
  it('returns the bare path when no version is provided', () => {
    expect(buildShortGlobalRankingSharePath('block-1')).toBe('/r/g/block-1');
  });

  it('appends a content-hash cache-buster', () => {
    expect(buildShortGlobalRankingSharePath('block-1', 'ranking-og-v3-def456')).toBe(
      '/r/g/block-1?v=ranking-og-v3-def456'
    );
  });
});
