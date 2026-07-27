import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RankingGalleryView } from './ranking-gallery-view';
import { RankingPillView } from './ranking-pill-view';
import type { RankingBlockState } from './use-ranking-block-state';

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

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-vote-actions />,
}));

function state(): RankingBlockState {
  const entityId = 'entity-1';
  return {
    spaceId: 'space-1',
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
  });

  it('does not render vote actions in Pill view', () => {
    const markup = renderToStaticMarkup(<RankingPillView state={state()} />);

    expect(markup).not.toContain('data-vote-actions');
  });
});
