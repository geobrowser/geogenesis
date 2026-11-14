import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTierLines } from '~/core/blocks/ranking/ranking-grades';

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
  bestDebatesSerial: undefined as undefined | boolean,
  lastIds: ['d1'] as string[],
  myGrades: new Map() as Map<string, 'A' | 'B' | 'C'>,
  grading: null as null | import('./best-debates/best-debate-grading').BestDebatesGrading,
  reorder: vi.fn(),
  composeArgs: null as null | Record<string, unknown>,
  search: 'relationId=r&parentEntityId=p&team=to-rank',
  mySubmission: null as null | { orderedEntityIds: string[] },
  myRanking: null as null | { tierLines?: { aCount: number; bCount: number; banner: React.ReactNode } },
  sentGrades: null as null | Map<string, string>,
  recordGrade: vi.fn(),
}));
vi.mock('./best-debates/best-debate-grading', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debates/best-debate-grading')>()),
  useRecordGrade: () => mocks.recordGrade,
}));

vi.mock('~/core/blocks/ranking/best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/blocks/ranking/best-debates')>()),
  BEST_DEBATES_BLOCK_ID: 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('jotai', async importOriginal => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtom: () => [null, vi.fn()],
  useSetAtom: () => vi.fn(),
}));
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
    mySubmission: mocks.mySubmission,
    // A draft with one debate, never published: publishable but for the guard.
    myLastSubmission: { orderedEntityIds: mocks.lastIds },
    myGrades: mocks.myGrades,
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
    serialPublishes?: boolean;
    saveMySubmission: (slots: { id: string; name: string | null; spaceId?: string }[]) => Promise<unknown>;
  }) => {
    mocks.composeArgs = args;
    mocks.bestDebatesEnabled = args.enabled;
    mocks.bestDebatesSerial = args.serialPublishes;
    return {
      teamView: undefined,
      mobileTabs: undefined,
      toRankIds: [],
      dialogs: null,
      isPlacing: false,
      activeEntityId: null,
      placeFromTeam: vi.fn(),
      dropEntity: vi.fn(),
      reorder: mocks.reorder,
      publish: async (ids: string[], grades?: Map<string, string>) => {
        mocks.sentGrades = grades ?? null;
        return Boolean(await args.saveMySubmission(ids.map(id => ({ id, name: null, spaceId: 'debate-space' }))));
      },
    };
  },
}));
vi.mock('./best-debates/best-debate-watch', () => ({
  BestDebateWatchProvider: ({
    grading,
    children,
  }: {
    grading?: import('./best-debates/best-debate-grading').BestDebatesGrading | null;
    children: React.ReactNode;
  }) => {
    mocks.grading = grading ?? null;
    return children;
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
// Your ranking draws only the tier lines' banner, so its Not now and Save grades can be pressed.
vi.mock('./ranking-compose-my-ranking', () => ({
  RankingComposeMyRanking: (props: NonNullable<typeof mocks.myRanking>) => {
    mocks.myRanking = props;
    return props.tierLines?.banner ?? null;
  },
}));
vi.mock('./ranking-compose-layout', () => ({
  RankingComposeLayout: ({ myRanking }: { myRanking: React.ReactNode }) => <>{myRanking}</>,
}));
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
  mocks.member = false;
  mocks.accessLoading = false;
  mocks.ensureAccess.mockReset();
  mocks.replace.mockReset();
  mocks.saveMySubmission.mockReset().mockResolvedValue(null);
  mocks.publish = null;
  mocks.canPublish = null;
  mocks.bestDebatesEnabled = null;
  mocks.authResolving = false;
  mocks.lastIds = ['d1'];
  mocks.myGrades = new Map();
  mocks.grading = null;
  mocks.search = 'relationId=r&parentEntityId=p&team=to-rank';
  mocks.mySubmission = null;
  mocks.myRanking = null;
  mocks.sentGrades = null;
});

afterEach(cleanup);

const renderScreen = () => render(<RankingComposeScreen spaceId={DEBATES_SPACE} />);

describe('RankingComposeScreen on the Best debates block', () => {
  it('sends no membership request to a non-member who opens the URL, and switches to view mode', () => {
    renderScreen();

    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.replace.mock.calls[0][0] as string, 'https://geo.test');
    expect(url.searchParams.get('mode')).toBe('view');
    // The rest of the link survives, so the view opens on the same block.
    expect(url.searchParams.get('relationId')).toBe('r');
  });

  it('waits for the access read before switching a member to view mode', () => {
    mocks.accessLoading = true;
    renderScreen();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
  });

  it('lets a member publish, in edit mode', async () => {
    mocks.member = true;
    renderScreen();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.canPublish).toBe(true);
    expect(mocks.bestDebatesEnabled).toBe(true);
    // The screen's one Publish is off while it publishes; only the block queues publishes (GEO-3729).
    expect(mocks.bestDebatesSerial).toBeFalsy();
    await act(async () => mocks.publish?.());
    // Through the Best debates publish (own spaces), built on the ballot the draft came from.
    expect(mocks.saveMySubmission).toHaveBeenCalledTimes(1);
    expect(mocks.saveMySubmission).toHaveBeenCalledWith(
      [{ id: 'd1', name: null, spaceId: 'debate-space' }],
      expect.anything(),
      { basedOnOrderedIds: ['d1'], basedOnGrades: expect.any(Map) }
    );
  });

  it('keeps a member who deep-links in edit mode when their sign-in resolves late', () => {
    // A pasted compose URL: sign-in is still starting, so access reads as none and not loading.
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
    mocks.authResolving = true;
    const { rerender } = renderScreen();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.authResolving = false;
    rerender(<RankingComposeScreen spaceId={DEBATES_SPACE} />);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(new URL(mocks.replace.mock.calls[0][0] as string, 'https://geo.test').searchParams.get('mode')).toBe('view');
  });

  it('shows a loading state, not the generic screen, until the access read settles', () => {
    mocks.member = true;
    mocks.accessLoading = true;
    renderScreen();

    expect(screen.getByRole('status')).toHaveTextContent('Loading ranking');
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });
});

describe('RankingComposeScreen on any other block', () => {
  it('still asks a non-member for membership and publishes', async () => {
    mocks.blockId = OTHER_BLOCK;
    renderScreen();

    expect(mocks.ensureAccess).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.bestDebatesEnabled).toBe(false);
    await act(async () => mocks.publish?.());
    expect(mocks.saveMySubmission).toHaveBeenCalledTimes(1);
  });

  it('puts the popup’s grades into the draft, and opens Re-order in the screen’s Placed step (GEO-3729)', async () => {
    mocks.member = true;
    // IDs are hex, as normId leaves them.
    const [d1, d2] = ['d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1', 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2'];
    mocks.lastIds = [d1, d2];
    mocks.myGrades = new Map([
      [d1, 'A'],
      [d2, 'B'],
    ]);
    renderScreen();
    expect(mocks.grading?.needsTierLines).toBe(false);
    await act(async () => mocks.grading?.grade(d2, 'A'));
    expect(mocks.grading?.gradeOf(d2)).toBe('A');
    // Top of A.
    expect(mocks.grading?.placeOf(d2)).toBe(1);
    expect(mocks.saveMySubmission).not.toHaveBeenCalled();
    expect(mocks.canPublish).toBe(true);
    mocks.grading?.reorder(d2);
    expect(mocks.reorder).toHaveBeenCalledWith(d2);
  });

  it('counts a grade Re-order changed as a reorder, in the draft and again when published (GEO-3729)', async () => {
    mocks.member = true;
    mocks.recordGrade.mockReset();
    const [a1, x] = ['a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5'];
    mocks.lastIds = [a1, x];
    mocks.myGrades = new Map([
      [a1, 'A'],
      [x, 'B'],
    ]);
    renderScreen();
    const before = { ids: [a1, x], grades: new Map(mocks.myGrades) };
    const after = {
      ids: [x, a1],
      grades: new Map([
        [a1, 'A'],
        [x, 'A'],
      ]),
    };
    type End = (end: object) => void;
    await act(async () => (mocks.composeArgs?.onReorderEnd as End)({ outcome: 'closed', entityId: x, before, after }));
    expect(mocks.recordGrade).toHaveBeenCalledWith(x, {
      grade: 'A',
      previousGrade: 'B',
      method: 'reorder',
      mutationKind: 'draft',
    });
    type OnPublished = (p: unknown, ids: string[], grades: Map<string, string>) => void;
    await act(async () =>
      (mocks.composeArgs?.onPublished as OnPublished)(
        { orderedEntityIds: after.ids, grades: after.grades, indexingSettled: Promise.resolve(null) },
        after.ids,
        after.grades
      )
    );
    expect(mocks.recordGrade).toHaveBeenLastCalledWith(x, {
      grade: 'A',
      previousGrade: 'B',
      method: 'reorder',
      mutationKind: 'published',
    });
  });
});

describe('Grade your ranking on the ranking screen (GEO-3729)', () => {
  const ids = [
    'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
    'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
    'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
  ];

  it('opens by itself on a published ranking with no grades, and Not now closes it', () => {
    mocks.member = true;
    mocks.lastIds = ids;
    mocks.mySubmission = { orderedEntityIds: ids };
    renderScreen();
    expect(mocks.myRanking?.tierLines).toBeDefined();
    act(() => screen.getByRole('button', { name: 'Not now' }).click());
    expect(mocks.myRanking?.tierLines).toBeUndefined();
  });

  it('stays shut on a first ranking still being drafted', () => {
    mocks.member = true;
    mocks.lastIds = ids;
    renderScreen();
    expect(mocks.myRanking?.tierLines).toBeUndefined();
  });

  it('opens from the block’s ?grade=tiers, and Not now still closes it', () => {
    mocks.member = true;
    mocks.lastIds = ids;
    mocks.search = 'relationId=r&parentEntityId=p&grade=tiers';
    renderScreen();
    expect(mocks.myRanking?.tierLines).toBeDefined();
    act(() => screen.getByRole('button', { name: 'Not now' }).click());
    expect(mocks.myRanking?.tierLines).toBeUndefined();
  });

  it('publishes the order with the tier lines’ grades, each counted as tier_lines', async () => {
    mocks.member = true;
    mocks.recordGrade.mockReset();
    mocks.lastIds = ids;
    mocks.mySubmission = { orderedEntityIds: ids };
    renderScreen();
    const { aCount, bCount } = mocks.myRanking!.tierLines!;
    const expected = applyTierLines(ids, aCount, bCount);
    await act(async () => screen.getByRole('button', { name: 'Save grades' }).click());
    expect(mocks.sentGrades).toEqual(expected);
    type OnPublished = (p: unknown, sent: string[], grades: typeof expected) => void;
    await act(async () =>
      (mocks.composeArgs?.onPublished as OnPublished)(
        { orderedEntityIds: ids, grades: expected, indexingSettled: Promise.resolve(null) },
        ids,
        expected
      )
    );
    expect(mocks.recordGrade.mock.calls.map(([, change]) => change.method)).toEqual(ids.map(() => 'tier_lines'));
  });
});
