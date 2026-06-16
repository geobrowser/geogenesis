import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildGlobalRankingMetadata,
  buildGlobalRankingMetadataFromParts,
  buildPersonalRankingMetadata,
  buildPersonalRankingMetadataFromParts,
} from './ranking-og-metadata';
import type { ResolvedGlobalRankingShare, ResolvedPersonalRankingShare } from './resolve-ranking-share';

const SITE_URL = new URL('https://geobrowser.io');

const personalResolved: ResolvedPersonalRankingShare = {
  kind: 'personal',
  rankEntityId: 'rank-1',
  authorSpaceId: 'author-space',
  blockEntityId: 'block-1',
  blockEntitySpaceId: 'block-space',
  parentEntityId: 'parent-1',
  relationId: 'rel-1',
  rankingStartDate: '2024-01-01',
  rankingEndDate: '2024-02-01',
  rankingName: 'My Ranking',
  authorName: 'Alice',
  ogVersion: 'ranking-og-v3-abcd1234',
  cardData: {
    kind: 'personal',
    rankEntityId: 'rank-1',
    authorSpaceId: 'author-space',
    blockEntityId: 'block-1',
    blockEntitySpaceId: 'block-space',
    rankingName: 'My Ranking',
    title: 'My Ranking',
    periodLabel: null,
    author: { name: 'Alice', avatarUrl: null, avatarSeed: 'seed' },
    entries: [],
  },
};

const globalResolved: ResolvedGlobalRankingShare = {
  kind: 'global',
  blockEntityId: 'block-1',
  blockEntitySpaceId: 'block-space',
  parentEntityId: 'parent-1',
  relationId: 'rel-1',
  rankingStartDate: '',
  rankingEndDate: '',
  rankingName: 'My Ranking',
  globalOgVersion: 'ranking-global-og-v3-abcd1234',
  cardData: {
    kind: 'global',
    rankEntityId: '',
    authorSpaceId: '',
    blockEntityId: 'block-1',
    blockEntitySpaceId: 'block-space',
    rankingName: 'My Ranking',
    title: 'My Ranking',
    periodLabel: null,
    author: { name: '', avatarUrl: null, avatarSeed: 'block-1' },
    entries: [],
  },
};

describe('buildPersonalRankingMetadataFromParts', () => {
  it('builds title, description and a summary_large_image card', () => {
    const meta = buildPersonalRankingMetadataFromParts({
      rankingName: 'My Ranking',
      authorName: 'Alice',
      imageUrl: 'https://cdn.example.com/og.png',
      url: 'https://geobrowser.io/r/rank-1',
    });

    expect(meta.title).toBe('My Ranking');
    expect(meta.openGraph?.url).toBe('https://geobrowser.io/r/rank-1');
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: 'https://cdn.example.com/og.png' }),
    ]);
    expect((meta.twitter as { card?: string }).card).toBe('summary_large_image');
    expect(meta.twitter?.images).toEqual(['https://cdn.example.com/og.png']);
  });

  it('falls back to a generic title when there is no author', () => {
    const meta = buildPersonalRankingMetadataFromParts({
      rankingName: 'My Ranking',
      authorName: '',
      imageUrl: 'https://cdn.example.com/og.png',
      url: 'https://geobrowser.io/r/rank-1',
    });
    expect(meta.openGraph?.title).toBe('My My Ranking');
  });
});

describe('buildGlobalRankingMetadataFromParts', () => {
  it('builds the global voting card', () => {
    const meta = buildGlobalRankingMetadataFromParts({
      rankingName: 'My Ranking',
      imageUrl: 'https://cdn.example.com/og.png',
      url: 'https://geobrowser.io/r/g/block-1',
    });
    expect(meta.title).toBe('My Ranking');
    expect(meta.openGraph?.url).toBe('https://geobrowser.io/r/g/block-1');
    expect(meta.description).toContain('global Geo ranking');
  });
});

describe('image url selection (storage unconfigured)', () => {
  let savedBaseUrl: string | undefined;

  beforeEach(() => {
    savedBaseUrl = process.env.SOCIAL_PREVIEW_PUBLIC_BASE_URL;
    delete process.env.SOCIAL_PREVIEW_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    if (savedBaseUrl === undefined) delete process.env.SOCIAL_PREVIEW_PUBLIC_BASE_URL;
    else process.env.SOCIAL_PREVIEW_PUBLIC_BASE_URL = savedBaseUrl;
  });

  it('uses the live preview endpoint and points the card at the short URL (personal)', async () => {
    const meta = await buildPersonalRankingMetadata(personalResolved, SITE_URL, '/r/rank-1');
    const imageUrl = meta.twitter?.images as string[];

    expect(imageUrl[0]).toContain('/api/ranking-og/preview');
    expect(imageUrl[0]).toContain('scope=personal');
    expect(meta.openGraph?.url).toBe('https://geobrowser.io/r/rank-1');
  });

  it('uses the live preview endpoint and points the card at the short URL (global)', async () => {
    const meta = await buildGlobalRankingMetadata(globalResolved, SITE_URL, '/r/g/block-1');
    const imageUrl = meta.twitter?.images as string[];

    expect(imageUrl[0]).toContain('/api/ranking-og/preview');
    expect(imageUrl[0]).toContain('scope=global');
    expect(meta.openGraph?.url).toBe('https://geobrowser.io/r/g/block-1');
  });
});
