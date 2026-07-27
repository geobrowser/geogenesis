import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RankingListView } from './ranking-list-view';
import type { RankingBlockState } from './use-ranking-block-state';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-entity-id={entityId} data-space-id={spaceId} data-vote-actions />
  ),
}));

describe('RankingListView', () => {
  it('always renders vote actions without requiring a shown Score property', () => {
    const entityId = 'entity-1';
    const spaceId = 'space-1';
    const state = {
      spaceId,
      globalDisplayEntityIds: [entityId],
      globalRankingEntryByEntityId: new Map([[entityId, { name: 'First entity' }]]),
      globalRankByEntityId: new Map([[entityId, 1]]),
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

    const markup = renderToStaticMarkup(<RankingListView state={state} />);

    expect(markup).toContain('First entity');
    expect(markup).toContain('data-vote-actions="true"');
    expect(markup).toContain(`data-entity-id="${entityId}"`);
    expect(markup).toContain(`data-space-id="${spaceId}"`);
  });
});
