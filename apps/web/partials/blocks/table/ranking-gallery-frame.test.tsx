import type React from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlockMainMediaState } from '~/core/hooks/use-block-main-media';

import type { RankingBlockState } from './use-ranking-block-state';

const mocks = vi.hoisted(() => ({
  media: { mainMedia: null, isFramePending: false } as BlockMainMediaState,
}));

vi.mock('~/core/blocks/data/use-view', () => ({
  useView: () => ({ shownColumnIds: ['video-property'] }),
}));

vi.mock('~/core/hooks/use-properties', () => ({
  useProperties: () => ({}),
}));

vi.mock('~/core/hooks/use-block-main-media', () => ({
  useBlockMainMedia: () => mocks.media,
}));

vi.mock('~/core/hooks/use-block-main-media-url', () => ({
  useBlockMainMediaUrl: () => ({ url: null, isResolving: false }),
}));

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMedia: () => ({ avatarUrl: null, coverUrl: null, isResolving: false }),
  useImageUrlFromEntity: () => null,
}));

vi.mock('~/design-system/geo-image', () => ({
  GeoImage: () => <div data-geo-image />,
  ThumbGeoImage: () => <div data-thumb-image />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: () => <div data-vote-actions />,
}));

const { RankingGalleryView } = await import('./ranking-gallery-view');

const withDimensions = (aspectRatio: string | null, height: number | null): BlockMainMediaState => ({
  mainMedia: {
    propertyId: 'video-property',
    kind: 'VIDEO',
    name: 'Debate videos',
    dimensions: { width: null, height, aspectRatio },
  },
  isFramePending: false,
});

function state(): RankingBlockState {
  const entityId = 'entity-1';
  return {
    spaceId: 'block-space',
    resolveEntitySpaceId: vi.fn(() => 'entity-space'),
    globalDisplayEntityIds: [entityId],
    globalRankingEntryByEntityId: new Map([
      [entityId, { entityId, name: 'First entity', description: null, image: null }],
    ]),
    totalGlobalRankingEntityCount: 1,
    entriesResolving: false,
    hasRankedByOthers: false,
    submissions: [],
    aggregatedSubmitterSpaceIds: [],
    aggregatedRankingCount: 0,
    periodState: 'in-progress',
    showEmbeddedGlobalPagination: false,
    embeddedGlobalPageNumber: 1,
    hasEmbeddedGlobalPreviousPage: false,
    hasEmbeddedGlobalNextPage: false,
    setEmbeddedGlobalPage: vi.fn(),
  } as unknown as RankingBlockState;
}

beforeEach(() => {
  mocks.media = { mainMedia: null, isFramePending: false };
});

describe('RankingGalleryView media frame', () => {
  it('holds the skeleton while the configured dimensions are still unknown', () => {
    mocks.media = { mainMedia: null, isFramePending: true };

    const markup = renderToStaticMarkup(<RankingGalleryView state={state()} />);

    expect(markup).toContain('animate-pulse');
    expect(markup).not.toContain('data-vote-actions');
  });

  it('sizes that skeleton like the card it stands in for, not a fixed 120px', () => {
    mocks.media = { ...withDimensions('540 / 820', null), isFramePending: true };

    const markup = renderToStaticMarkup(<RankingGalleryView state={state()} />);

    expect(markup).toContain('aspect-ratio:540 / 820');
    expect(markup).not.toContain('h-[120px]');
  });

  it('keeps the fixed height when the block configures no dimensions', () => {
    mocks.media = { mainMedia: null, isFramePending: true };

    const markup = renderToStaticMarkup(<RankingGalleryView state={state()} />);

    expect(markup).toContain('h-[120px]');
  });

  it('renders the cards once the frame resolves', () => {
    mocks.media = withDimensions('540 / 820', null);

    const markup = renderToStaticMarkup(<RankingGalleryView state={state()} />);

    expect(markup).toContain('data-vote-actions');
    expect(markup).toContain('aspect-ratio:540 / 820');
  });
});
