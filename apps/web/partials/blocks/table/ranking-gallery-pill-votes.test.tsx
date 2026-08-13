import type React from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RankingGalleryView } from './ranking-gallery-view';
import { RankingPillView } from './ranking-pill-view';
import type { RankingBlockState } from './use-ranking-block-state';

vi.mock('~/core/blocks/data/use-view', () => ({
  useView: () => ({ shownColumnIds: [] }),
}));

vi.mock('~/core/hooks/use-properties', () => ({
  useProperties: () => ({}),
}));

vi.mock('~/core/hooks/use-block-main-media', () => ({
  useBlockMainMedia: () => ({ mainMedia: null, isFramePending: false }),
}));

vi.mock('~/core/hooks/use-block-main-media-url', () => ({
  useBlockMainMediaUrl: () => ({ url: null, isResolving: false }),
}));

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMedia: () => ({ avatarUrl: null, coverUrl: null }),
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
  EntityRowActions: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-entity-id={entityId} data-space-id={spaceId} data-vote-actions />
  ),
}));

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

describe('ranking specialized view votes', () => {
  it('renders vote actions in Gallery view', () => {
    const markup = renderToStaticMarkup(<RankingGalleryView state={state()} />);

    expect(markup).toContain('data-vote-actions="true"');
    expect(markup).toContain('data-entity-id="entity-1"');
    expect(markup).toContain('data-space-id="entity-space"');
    expect(markup).toContain('/space/block-space/entity-1');
  });

  it('does not render vote actions in Pill view', () => {
    const markup = renderToStaticMarkup(<RankingPillView state={state()} />);

    expect(markup).not.toContain('data-vote-actions');
  });
});
