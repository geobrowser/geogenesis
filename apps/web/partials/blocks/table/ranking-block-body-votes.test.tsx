import type React from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RankingBlockBody } from './ranking-block-body';
import type { RankingBlockState } from './use-ranking-block-state';

vi.mock('./ranking-compose-entity-sheet', () => ({
  RankingComposeEntitySheet: () => null,
}));

vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({
    entry,
    spaceId,
    actions,
  }: {
    entry: { entityId: string };
    spaceId: string;
    actions?: React.ReactNode;
  }) => (
    <div data-row-entity-id={entry.entityId} data-row-space-id={spaceId}>
      {actions}
    </div>
  ),
  RankingEntryRowSkeleton: () => <div data-row-skeleton />,
}));

vi.mock('./ranking-entry-vote-controls', () => ({
  RankingEntryVoteControls: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-vote-entity-id={entityId} data-vote-space-id={spaceId} data-vote-actions />
  ),
}));

vi.mock('./ranking-my-ranking-dnd', () => ({
  RankingMyRankingDndList: ({
    entityIds,
    renderItem,
    renderTrailing,
  }: {
    entityIds: string[];
    renderItem: (entityId: string, index: number, isDragActive: boolean, imageUrl: null) => React.ReactNode;
    renderTrailing?: (entityId: string, index: number, isDragActive: boolean) => React.ReactNode;
  }) => (
    <>
      {entityIds.map((entityId, index) => (
        <div key={entityId}>
          {renderItem(entityId, index, false, null)}
          {renderTrailing?.(entityId, index, false)}
        </div>
      ))}
    </>
  ),
}));

function state(activeTab: 'global' | 'my'): RankingBlockState {
  const entityId = `${activeTab}-entity`;
  const entry = { entityId, name: `${activeTab} entry`, description: null, image: null };

  return {
    spaceId: 'space-1',
    isMobile: false,
    showFirstRankingPrompt: false,
    showMyRankingTab: activeTab === 'my',
    showMyRankingSection: activeTab === 'my',
    showAddMyRankingInGlobalHeader: false,
    myRankingTabLabel: 'My ranking',
    activeTab,
    setActiveTab: vi.fn(),
    globalDisplayEntityIds: activeTab === 'global' ? [entityId] : [],
    totalGlobalRankingEntityCount: activeTab === 'global' ? 1 : 0,
    hasMyRankingData: true,
    globalRankingEntryByEntityId: new Map([[entityId, entry]]),
    globalRankByEntityId: new Map([[entityId, 1]]),
    pendingEntityIds: new Set(),
    entriesResolving: false,
    showEmbeddedGlobalPagination: false,
    embeddedGlobalPageNumber: 0,
    hasEmbeddedGlobalPreviousPage: false,
    hasEmbeddedGlobalNextPage: false,
    setEmbeddedGlobalPage: vi.fn(),
    myDisplayEntityIds: activeTab === 'my' ? [entityId] : [],
    totalMyRankingEntityCount: activeTab === 'my' ? 1 : 0,
    embeddedMyPageNumber: 0,
    showEmbeddedMyPagination: false,
    hasEmbeddedMyPreviousPage: false,
    hasEmbeddedMyNextPage: false,
    setEmbeddedMyPage: vi.fn(),
    myRankingEntryByEntityId: new Map([[entityId, entry]]),
    // Inert: these tests are about vote actions, not the shared-ranking viewer tab.
    showViewerOwnTab: false,
    viewerOwnDisplayEntityIds: [],
    totalViewerOwnEntityCount: 0,
    viewerOwnEntryByEntityId: new Map(),
    shareViewerOwnRanking: vi.fn(),
    canShareViewerOwnRanking: false,
    draftHydrated: true,
    hasMySubmission: false,
    isSharedRankingView: false,
    reorderMyRanking: vi.fn(),
    openEntitySheet: vi.fn(),
    resolveEntitySpaceId: vi.fn(id => `entity-space-${id}`),
    activeSwipeRowKey: null,
    setActiveSwipeRowKey: vi.fn(),
    isMyRankingDragging: false,
    setIsMyRankingDragging: vi.fn(),
    entitySheetTarget: null,
    setEntitySheetTarget: vi.fn(),
    pageSize: 10,
    showEditRankingButton: false,
    isRollingRolledOff: false,
    isSaving: false,
    openRankingCompose: vi.fn(),
    canSharePersonalRanking: false,
    sharePersonalRanking: vi.fn(),
  } as unknown as RankingBlockState;
}

describe('RankingBlockBody votes', () => {
  it.each(['global', 'my'] as const)('shows vote actions on %s ranking rows', activeTab => {
    const markup = renderToStaticMarkup(<RankingBlockBody state={state(activeTab)} />);
    const entityId = `${activeTab}-entity`;

    expect(markup).toContain('data-vote-actions="true"');
    expect(markup).toContain(`data-vote-entity-id="${entityId}"`);
    expect(markup).toContain(`data-vote-space-id="entity-space-${entityId}"`);
    expect(markup).toContain(`data-row-space-id="space-1"`);
  });
});
