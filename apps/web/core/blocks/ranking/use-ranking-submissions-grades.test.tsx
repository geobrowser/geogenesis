import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BallotGrades, Grade } from './ranking-grades';
import { resetRankingPublishStateForTests } from './ranking-publish-queue';
import { useRankingSubmissions } from './use-ranking-submissions';

// GEO-3729: grades ride every Best debates publish, because every publish re-creates every vote.

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  publish: vi.fn(),
  reportError: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  withVoteGrades: vi.fn(),
  published: { rankEntity: null as unknown, orderedEntityIds: [] as string[], grades: new Map() as BallotGrades },
  hookGrades: new Map() as BallotGrades,
  gradesPendingError: null as Error | null,
}));

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BLOCK = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DEBATES_SPACE = '9284477c8fe746368698994e2e517b32';
const DEBATE_SPACE = 'ffffffffffffffffffffffffffffffff';
const RANK = '44444444444444444444444444444444';
const id = (n: number) => n.toString(16).padStart(32, '0');

vi.mock('./best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debates')>()),
  BEST_DEBATES_BLOCK_ID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
}));
vi.mock('~/core/analytics', () => ({ capture: vi.fn(), analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' }, sendUserOperation: mocks.send } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
  personalSpaceIdQueryKey: (address: string) => ['personal-space', address],
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/io/queries', () => ({ getEntity: () => ({}) }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { personalSpaces: { publishEdit: mocks.publish }, ranks: { update: mocks.update } },
}));
vi.mock('./vote-grade-ops', () => ({ withVoteGrades: mocks.withVoteGrades }));
vi.mock('./use-my-ranking', () => ({
  useMyRanking: () => ({
    myRankEntity: mocks.published.rankEntity,
    orderedEntityIds: mocks.published.orderedEntityIds,
    grades: mocks.hookGrades,
    gradesPendingError: mocks.gradesPendingError,
    isLoading: false,
    refetchMyRanking: vi.fn().mockResolvedValue(undefined),
  }),
  recordPublishedRank: vi.fn(),
  releasePublishedRankPin: vi.fn(),
  fetchMyRankingBallot: vi.fn(async () => mocks.published),
}));
vi.mock('./use-ranking-block-config', () => ({
  useRankingBlockConfig: () => ({ isRolling: false, submissionFrequencyHours: null }),
}));
vi.mock('@geoprotocol/geo-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@geoprotocol/geo-sdk')>();
  return { ...actual, Ops: { ...actual.Ops, ranks: { create: mocks.create } } };
});

const ORDINAL_RANK = {
  id: RANK,
  createdAt: '1',
  updatedAt: '1',
  relations: [],
  values: [{ property: { id: '48e01bc8324e48c2a6c9cab3f49290c6' }, value: 'ORDINAL', isDeleted: false }],
};

const grades = (entries: Array<[number, Grade]>): BallotGrades => new Map(entries.map(([n, g]) => [id(n), g]));

function publishedBallot(ids: string[], ballotGrades: BallotGrades) {
  mocks.published = { rankEntity: ORDINAL_RANK, orderedEntityIds: ids, grades: ballotGrades };
  mocks.hookGrades = ballotGrades;
}

/** The ids and grades the last publish wrote, in order. */
function written() {
  const [, , votes, gradeMap] = mocks.withVoteGrades.mock.calls.at(-1) as [
    unknown,
    unknown,
    Array<{ entityId: string }>,
    BallotGrades,
  ];
  return votes.map(vote => [vote.entityId, gradeMap.get(vote.entityId) ?? null]);
}

const slot = (n: number, grade?: Grade | null) => ({
  id: id(n),
  name: null,
  spaceId: DEBATE_SPACE,
  ...(grade === undefined ? {} : { grade }),
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRankingPublishStateForTests();
  mocks.send.mockResolvedValue('0xhash');
  mocks.publish.mockResolvedValue({ to: '0xabc', calldata: '0x01' });
  mocks.update.mockImplementation(async ({ votes }: { votes: unknown[] }) => ({
    id: RANK,
    ops: [{ op: 'votes' }],
    voteIds: votes.map((_, i) => id(5000 + i)),
  }));
  mocks.create.mockImplementation(({ votes }: { votes: unknown[] }) => ({
    id: RANK,
    ops: [{ op: 'votes' }],
    voteIds: votes.map((_, i) => id(5000 + i)),
  }));
  mocks.withVoteGrades.mockImplementation((ops: unknown[]) => [...ops, { op: 'grades' }]);
  publishedBallot([], new Map());
  mocks.gradesPendingError = null;
});

function render(blockId = BLOCK, blockSpaceId = DEBATES_SPACE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
  return renderHook(() => useRankingSubmissions(blockId, blockSpaceId, 'Best debates'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('grades on a Best debates publish (GEO-3729)', () => {
  it('keeps every grade when an edit that knows nothing of grades removes a debate (Down rank)', async () => {
    publishedBallot(
      [id(1), id(2), id(3)],
      grades([
        [1, 'A'],
        [2, 'B'],
        [3, 'C'],
      ])
    );
    const view = render();
    await act(async () => {
      await view.result.current.saveMySubmission([slot(1), slot(3)], undefined, {
        basedOnOrderedIds: [id(1), id(2), id(3)],
      });
    });
    expect(written()).toEqual([
      [id(1), 'A'],
      [id(3), 'C'],
    ]);
    expect((mocks.publish.mock.calls[0][0] as { ops: unknown[] }).ops).toEqual([{ op: 'votes' }, { op: 'grades' }]);
  });

  it('writes a slot’s grade and clears a null one', async () => {
    publishedBallot(
      [id(1), id(2)],
      grades([
        [1, 'A'],
        [2, 'B'],
      ])
    );
    const view = render();
    let result: { grades: BallotGrades } | null = null;
    await act(async () => {
      result = await view.result.current.saveMySubmission([slot(1, 'B'), slot(2, null), slot(3, 'C')]);
    });
    expect(written()).toEqual([
      [id(1), 'B'],
      [id(2), null],
      [id(3), 'C'],
    ]);
    expect(result!.grades.get(id(3))).toBe('C');
  });

  it('keeps another device’s regrade and moves that debate into its new tier', async () => {
    // This device built its edit on [1 A, 2 A, 3 C] and only swapped 1 and 2. Meanwhile another
    // device regraded 1 to C (bottom of C).
    publishedBallot(
      [id(2), id(3), id(1)],
      grades([
        [1, 'C'],
        [2, 'A'],
        [3, 'C'],
      ])
    );
    const view = render();
    await act(async () => {
      await view.result.current.saveMySubmission([slot(2), slot(1), slot(3)], undefined, {
        basedOnOrderedIds: [id(1), id(2), id(3)],
        basedOnGrades: grades([
          [1, 'A'],
          [2, 'A'],
          [3, 'C'],
        ]),
      });
    });
    expect(written()).toEqual([
      [id(2), 'A'],
      [id(3), 'C'],
      [id(1), 'C'],
    ]);
  });

  it('publishes a grade-only change even when the order is the same', async () => {
    publishedBallot(
      [id(1), id(2)],
      grades([
        [1, 'A'],
        [2, 'B'],
      ])
    );
    const view = render();
    await act(async () => {
      await view.result.current.saveMySubmission([slot(1, 'B'), slot(2)]);
    });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(written()).toEqual([
      [id(1), 'B'],
      [id(2), 'B'],
    ]);
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it('writes no grades on any other block', async () => {
    const view = render('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', SPACE);
    await act(async () => {
      await view.result.current.saveMySubmission([slot(1, 'A')]);
    });
    expect(mocks.withVoteGrades).not.toHaveBeenCalled();
  });

  it('holds publishing and says so while the grades can’t be read in step with the votes', () => {
    mocks.gradesPendingError = new Error('Your ranking is still updating. Try again in a moment.');
    const view = render();
    expect(view.result.current.ballotReadError).toBe('Your ranking is still updating. Try again in a moment.');
  });
});
