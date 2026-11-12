import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RankingComposeScreen } from './ranking-compose-screen';

/**
 * GEO-3677 review round 2: a compose URL opened directly on the Best debates block (a pasted
 * "Rank the rest" link) must not send a membership request or publish for someone the block's own
 * buttons would refuse. Every other block keeps today's behaviour.
 */

const DEBATES_SPACE = '9284477c8fe746368698994e2e517b32';
const BLOCK = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';
const OTHER_BLOCK = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';

const mocks = vi.hoisted(() => ({
  blockId: '',
  flag: false,
  member: false,
  accessLoading: false,
  authResolving: false,
  ensureAccess: vi.fn(),
  replace: vi.fn(),
  saveMySubmission: vi.fn(),
  publish: null as null | (() => void),
  canPublish: null as null | boolean,
  empty: [] as never[],
  bestDebatesEnabled: null as null | boolean,
}));

vi.mock('~/core/blocks/ranking/best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/blocks/ranking/best-debates')>()),
  BEST_DEBATES_BLOCK_ID: 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('relationId=r&parentEntityId=p&team=to-rank'),
}));
vi.mock('jotai', async importOriginal => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtom: () => [null, vi.fn()],
  useSetAtom: () => vi.fn(),
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/hooks/use-hydrated', () => ({ useHydrated: () => true }));
vi.mock('~/core/hooks/use-auth-resolving', () => ({ useAuthResolving: () => mocks.authResolving }));
vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({
    canEdit: mocks.member,
    isMember: mocks.member,
    isEditor: false,
    isLoading: mocks.accessLoading,
  }),
}));
vi.mock('~/core/hooks/use-ranking-compose-access', () => ({
  rankingComposeNeedsAccountStep: () => false,
  useRankingComposeAccess: () => ({
    status: mocks.member ? 'ready' : 'needs-membership',
    canEdit: mocks.member,
    isLoading: false,
    ensureAccess: mocks.ensureAccess,
    recheckAccess: vi.fn(),
  }),
}));
vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ name: 'Best debates', entityId: mocks.blockId, filterState: mocks.empty }),
}));
vi.mock('~/core/blocks/ranking/ranking-compose-publish-spaces', () => ({
  resolveRankingSingleTargetSpaceId: () => null,
}));
vi.mock('~/core/blocks/ranking/ranking-period', () => ({
  getRankingPeriodState: () => 'in-progress',
  rankingSubmissionsOpen: () => true,
}));
vi.mock('~/core/blocks/ranking/use-ranking-block-dates', () => ({ useRankingBlockDates: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-period', () => ({
  useRankingPeriod: () => ({ periodState: 'in-progress', periodLabel: null, submissionsOpen: true }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    submissions: mocks.empty,
    mySubmission: null,
    // A draft with one debate, never published: publishable but for the guard.
    myLastSubmission: { orderedEntityIds: ['d1'] },
    saveMySubmission: mocks.saveMySubmission,
    isSaving: false,
    personalSpaceId: 'me',
    isLoading: false,
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-block-relations', () => ({
  useRankingBlockRelations: () => ({
    globalRankingEntityIds: mocks.empty,
    globalLeaderboard: mocks.empty,
    aggregatedSubmitterRefs: mocks.empty,
    aggregatedSubmitterSpaceIds: mocks.empty,
    aggregatedRankingCount: 0,
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-accumulated-rows', () => ({
  useRankingAccumulatedRows: () => ({
    rows: mocks.empty,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-compose-search', () => ({
  useRankingComposeSearch: () => ({
    results: mocks.empty,
    isLoading: false,
    isSettled: true,
    isDebouncingAfterEmptySearch: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: mocks.empty, isLoading: false }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-pending-proposals', () => ({
  useRankingPendingEntities: () => ({ pendingEntityIds: new Set(), pendingEntriesByEntityId: new Map() }),
}));
vi.mock('~/core/hooks/use-create-entity-with-filters', () => ({
  useCreateEntityWithFilters: () => ({ onClick: vi.fn() }),
}));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));
vi.mock('~/core/hooks/use-onboarding', () => ({ useOnboarding: () => ({ showOnboarding: vi.fn() }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/pending-actions', () => ({ useEnqueuePendingAction: () => vi.fn() }));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/use-ranking-opportunity', () => ({
  useRankingOpportunity: () => ({ root: vi.fn(), context: {} }),
}));
vi.mock('~/partials/onboarding/onboarding-atoms', () => ({ stepAtom: {} }));
// GEO-3679's reads and the downvote-clearing publish: the publish runs the ballot write straight.
vi.mock('~/core/blocks/ranking/use-my-pushed-down-debates', () => ({
  useMyPushedDownDebates: () => ({ debates: mocks.empty, isError: false, retry: vi.fn() }),
  useBestDebatesBallotPublisher: () => ({
    publish: async (_ids: readonly string[], save: () => Promise<unknown>) => {
      const published = await save();
      return published ? { published, failedClears: 0 } : null;
    },
    isPublishing: false,
  }),
}));
// GEO-3678's additions: its publish files each debate under its own space, then writes the ballot
// through the screen's `saveMySubmission` (the downvote-clearing publish above).
vi.mock('~/core/blocks/ranking/use-best-debate-displays', () => ({ useBestDebateDisplays: () => new Map() }));
vi.mock('./best-debates/use-best-debates-compose', () => ({
  useBestDebatesCompose: (args: {
    enabled: boolean;
    saveMySubmission: (slots: { id: string; name: string | null; spaceId?: string }[]) => Promise<unknown>;
  }) => {
    mocks.bestDebatesEnabled = args.enabled;
    return {
      teamView: undefined,
      mobileTabs: undefined,
      toRankIds: [],
      dialogs: null,
      isPlacing: false,
      activeEntityId: null,
      placeFromTeam: vi.fn(),
      dropEntity: vi.fn(),
      publish: async (ids: string[]) =>
        Boolean(await args.saveMySubmission(ids.map(id => ({ id, name: null, spaceId: 'debate-space' })))),
    };
  },
}));
vi.mock('./ranking-compose-pushed-down', () => ({ RankingComposePushedDown: () => null }));
vi.mock('~/app/not-found', () => ({ default: () => <div>404</div> }));

// The screen's children: only the toolbar matters here, for its publish handler.
vi.mock('./ranking-compose-create-entity-panel', () => ({ RankingComposeCreateEntityPanel: () => null }));
vi.mock('./ranking-compose-entity-sheet', () => ({ RankingComposeEntitySheet: () => null }));
vi.mock('./ranking-compose-fullscreen', () => ({
  RankingComposeFullscreen: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./ranking-compose-global-ranking', () => ({ RankingComposeGlobalRanking: () => null }));
vi.mock('./ranking-compose-my-ranking', () => ({ RankingComposeMyRanking: () => null }));
vi.mock('./ranking-compose-layout', () => ({ RankingComposeLayout: () => null }));
vi.mock('./ranking-compose-header', () => ({
  RankingComposeTitleMetadata: () => null,
  RankingComposePinnedToolbar: ({ canPublish, onPublish }: { canPublish: boolean; onPublish: () => void }) => {
    mocks.publish = onPublish;
    mocks.canPublish = canPublish;
    return <div data-testid="toolbar" />;
  },
}));

beforeEach(() => {
  mocks.blockId = BLOCK;
  mocks.flag = false;
  mocks.member = false;
  mocks.accessLoading = false;
  mocks.ensureAccess.mockReset();
  mocks.replace.mockReset();
  mocks.saveMySubmission.mockReset().mockResolvedValue(null);
  mocks.publish = null;
  mocks.canPublish = null;
  mocks.bestDebatesEnabled = null;
  mocks.authResolving = false;
});

afterEach(cleanup);

const renderScreen = () => render(<RankingComposeScreen spaceId={DEBATES_SPACE} />);

describe('RankingComposeScreen on the Best debates block', () => {
  it('sends no membership request to a non-member who opens the URL, and switches to view mode', () => {
    mocks.flag = true;
    renderScreen();

    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.replace.mock.calls[0][0] as string, 'https://geo.test');
    expect(url.searchParams.get('mode')).toBe('view');
    // The rest of the link survives, so the view opens on the same block.
    expect(url.searchParams.get('relationId')).toBe('r');
  });

  it('does not let a member with the flag off publish', async () => {
    mocks.member = true;
    renderScreen();

    expect(mocks.canPublish).toBe(false);
    await act(async () => mocks.publish?.());
    expect(mocks.saveMySubmission).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it('waits for the access read before switching a member to view mode', () => {
    mocks.flag = true;
    mocks.accessLoading = true;
    renderScreen();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
  });

  it('lets a member with the flag on publish, in edit mode', async () => {
    mocks.flag = true;
    mocks.member = true;
    renderScreen();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.canPublish).toBe(true);
    expect(mocks.bestDebatesEnabled).toBe(true);
    await act(async () => mocks.publish?.());
    // Through the Best debates publish (own spaces), built on the ballot the draft came from.
    expect(mocks.saveMySubmission).toHaveBeenCalledTimes(1);
    expect(mocks.saveMySubmission).toHaveBeenCalledWith(
      [{ id: 'd1', name: null, spaceId: 'debate-space' }],
      expect.anything(),
      { basedOnOrderedIds: ['d1'] }
    );
  });

  it('keeps a member who deep-links in edit mode when their sign-in resolves late', () => {
    // A pasted compose URL: sign-in is still starting, so access reads as none and not loading.
    mocks.flag = true;
    mocks.member = false;
    mocks.authResolving = true;
    const { rerender } = renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('Loading ranking');
    expect(mocks.replace).not.toHaveBeenCalled();

    // The account and the membership arrive.
    mocks.authResolving = false;
    mocks.member = true;
    rerender(<RankingComposeScreen spaceId={DEBATES_SPACE} />);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.bestDebatesEnabled).toBe(true);
  });

  it('downgrades a non-member to view once sign-in has resolved, not before', () => {
    mocks.flag = true;
    mocks.authResolving = true;
    const { rerender } = renderScreen();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.authResolving = false;
    rerender(<RankingComposeScreen spaceId={DEBATES_SPACE} />);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(new URL(mocks.replace.mock.calls[0][0] as string, 'https://geo.test').searchParams.get('mode')).toBe('view');
  });

  it('shows a loading state, not the generic screen, until the access read settles', () => {
    mocks.flag = true;
    mocks.member = true;
    mocks.accessLoading = true;
    renderScreen();

    expect(screen.getByRole('status')).toHaveTextContent('Loading ranking');
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });
});

describe('RankingComposeScreen on any other block', () => {
  it('still asks a non-member for membership and publishes, flag or not', async () => {
    mocks.blockId = OTHER_BLOCK;
    renderScreen();

    expect(mocks.ensureAccess).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.bestDebatesEnabled).toBe(false);
    await act(async () => mocks.publish?.());
    expect(mocks.saveMySubmission).toHaveBeenCalledTimes(1);
  });
});
