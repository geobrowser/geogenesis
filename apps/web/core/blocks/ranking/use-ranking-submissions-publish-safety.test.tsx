import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RANK_TYPE_ID, RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Relation } from '~/core/types';

import { rankingPublishTiming, resetRankingPublishStateForTests } from './ranking-publish-queue';
import { resetPublishedRankPinsForTests } from './use-my-ranking';
import { useRankingSubmissions } from './use-ranking-submissions';

/*
 * GEO-3680. A fake index stands in for the Geo API behind `~/core/io/queries`;
 * everything above it (`fetchMyRankingBallot`, `useMyRanking` and its pin, the
 * publish path) is the real code. A sent edit replaces the rank's stored votes
 * with the ones it carries, as the indexer does, but only after a lag. The
 * block listing truncates each rank's relations at 1,000 (as
 * `relationsList(first: 1000)` does); the single-entity read pages them all.
 */

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BLOCK = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RANK = 'cccccccccccccccccccccccccccccccc';
const item = (n: number) => `d${n.toString(16).padStart(31, '0')}`;

type FakeRank = { id: string; createdAt: number; updatedAt?: number; ids: string[]; unreadable?: boolean };
type FakeEdit = { rankId: string; ids: string[] };

const state = vi.hoisted(() => ({
  ranks: [] as { id: string; createdAt: number; updatedAt?: number; ids: string[]; unreadable?: boolean }[],
  indexLagMs: 20,
  /** Replaces what a sent edit does to the index (e.g. another device's edit lands instead). */
  onSent: null as null | ((edit: { rankId: string; ids: string[] }) => void),
  indexes: true,
  sendError: null as Error | null,
  active: 0,
  maxActive: 0,
  sentBallots: [] as string[][],
  createdRanks: 0,
  isRolling: false,
  submissionFrequencyHours: null as number | null,
}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  publish: vi.fn(),
  reportError: vi.fn(),
  setToast: vi.fn(),
  update: vi.fn(),
  listingReads: vi.fn(),
  entityReads: vi.fn(),
}));

function relationsOf(rank: FakeRank, limit = Infinity): Relation[] {
  const votes = rank.ids.map(
    (to, index) =>
      ({
        id: `${index.toString(16).padStart(31, '0')}1`,
        entityId: `${index.toString(16).padStart(31, '0')}2`,
        type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
        fromEntity: { id: rank.id, name: null },
        toEntity: { id: to, name: null, value: to },
        renderableType: 'RELATION',
        position: `a${index.toString().padStart(6, '0')}`,
        spaceId: SPACE,
        toSpaceId: SPACE,
      }) as Relation
  );
  const submittedTo = {
    id: 'f'.repeat(32),
    entityId: 'e'.repeat(32),
    type: { id: SUBMITTED_TO_PROPERTY_ID, name: null },
    fromEntity: { id: rank.id, name: null },
    toEntity: { id: BLOCK, name: null, value: BLOCK },
    renderableType: 'RELATION',
    spaceId: SPACE,
  } as Relation;
  return [submittedTo, ...votes].slice(0, limit);
}

function entityOf(rank: FakeRank, relationLimit?: number): Entity {
  return {
    id: rank.id,
    name: null,
    description: null,
    spaces: [SPACE],
    types: [{ id: RANK_TYPE_ID, name: null }],
    relations: relationsOf(rank, relationLimit),
    values: [],
    createdAt: rank.createdAt,
    updatedAt: rank.updatedAt ?? rank.createdAt,
  } as Entity;
}

vi.mock('~/core/io/queries', () => ({
  getAllEntities: () =>
    Effect.sync(() => {
      mocks.listingReads();
      return { entities: state.ranks.map(rank => entityOf(rank, 1000)) };
    }),
  getEntity: (id: string) =>
    Effect.sync(() => {
      mocks.entityReads();
      const rank = state.ranks.find(r => r.id === id);
      // `getEntity` returns null when the entity fails to decode.
      return rank && !rank.unreadable ? entityOf(rank) : null;
    }),
}));
vi.mock('~/core/analytics', () => ({ capture: vi.fn(), analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' }, sendUserOperation: mocks.send } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: SPACE }),
  personalSpaceIdQueryKey: (address: string) => ['personal-space', address],
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { personalSpaces: { publishEdit: mocks.publish }, ranks: { update: mocks.update } },
}));
vi.mock('./use-ranking-block-config', () => ({
  useRankingBlockConfig: () => ({
    isRolling: state.isRolling,
    submissionFrequencyHours: state.submissionFrequencyHours,
  }),
}));
vi.mock('@geoprotocol/geo-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@geoprotocol/geo-sdk')>();
  return {
    ...actual,
    Ops: {
      ...actual.Ops,
      ranks: {
        create: ({ votes }: { votes: { entityId: string }[] }) => {
          state.createdRanks += 1;
          const id = `${'e'.repeat(31)}${state.createdRanks}`;
          return { id, ops: [{ rankId: id, ids: votes.map(v => v.entityId) }] };
        },
      },
    },
  };
});

function applyToIndex(edit: FakeEdit) {
  const existing = state.ranks.find(r => r.id === edit.rankId);
  if (existing) {
    existing.ids = edit.ids;
    existing.updatedAt = Date.now();
  } else state.ranks.push({ id: edit.rankId, createdAt: Date.now(), updatedAt: Date.now(), ids: edit.ids });
}

const savedTiming = { ...rankingPublishTiming };

beforeEach(() => {
  vi.clearAllMocks();
  resetRankingPublishStateForTests();
  resetPublishedRankPinsForTests();
  Object.assign(rankingPublishTiming, {
    initialDelayMs: 1,
    pollIntervalMs: 5,
    listingPollIntervalMs: 5,
    listingPollMaxIntervalMs: 20,
    maxPollMs: 1_000,
  });
  state.ranks = [];
  state.indexLagMs = 20;
  state.onSent = null;
  state.indexes = true;
  state.sendError = null;
  state.active = 0;
  state.maxActive = 0;
  state.sentBallots = [];
  state.createdRanks = 0;
  state.isRolling = false;
  state.submissionFrequencyHours = null;
  delete process.env.NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS;

  mocks.update.mockImplementation(async ({ rankId, votes }: { rankId: string; votes: { entityId: string }[] }) => ({
    id: rankId,
    ops: [{ rankId, ids: votes.map(v => v.entityId) }],
  }));
  mocks.publish.mockImplementation(async ({ ops }: { ops: FakeEdit[] }) => ({ to: '0xabc', calldata: ops }));
  mocks.send.mockImplementation(async ({ calls }: { calls: { data: FakeEdit[] }[] }) => {
    state.active += 1;
    state.maxActive = Math.max(state.maxActive, state.active);
    const edit = calls[0].data[0];
    state.sentBallots.push(edit.ids);
    await new Promise(resolve => setTimeout(resolve, 5));
    state.active -= 1;
    if (state.sendError) {
      const error = state.sendError;
      state.sendError = null;
      throw error;
    }
    const onSent = state.onSent;
    if (onSent) {
      state.onSent = null;
      onSent(edit);
    } else if (state.indexes) {
      setTimeout(() => applyToIndex(edit), state.indexLagMs);
    }
    return '0xhash';
  });
});

afterEach(() => {
  Object.assign(rankingPublishTiming, savedTiming);
});

async function renderSubmissions(expectedSeen: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
  const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Best debates'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => {
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.myLastSubmission?.orderedEntityIds ?? []).toEqual(expectedSeen);
  });
  return {
    view,
    done: () => {
      view.unmount();
      client.clear();
    },
  };
}

type Published = { orderedEntityIds: string[]; indexingSettled: Promise<unknown> } | null;

const OVERTAKEN =
  "Your ranking changed on another device while this change was saving. Your change wasn't saved yet — check your ranking and publish again.";

const slot = (id: string) => ({ id, name: null, spaceId: SPACE });
const slots = (ids: string[]) => ids.map(slot);
const lastToast = () => JSON.stringify(mocks.setToast.mock.calls.at(-1));
const settle = (results: Published[]) => Promise.all(results.map(r => r?.indexingSettled));

describe('ranking publish safety (GEO-3680)', () => {
  it('placing 5 debates back to back leaves all 5 in the published list, in order, one publish at a time', async () => {
    const { view, done } = await renderSubmissions();
    const save = view.result.current.saveMySubmission;

    // Each placement is built from the list the screen last read (empty): none
    // of them knows about the others.
    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([1, 2, 3, 4, 5].map(n => save([slot(item(n))])));
      await settle(results);
    });

    expect(results.every(Boolean)).toBe(true);
    expect(state.ranks).toHaveLength(1);
    expect(state.ranks[0].ids).toEqual([1, 2, 3, 4, 5].map(item));
    expect(state.maxActive).toBe(1);
    // Each edit is built on the one before it.
    expect(state.sentBallots).toEqual([1, 2, 3, 4, 5].map(n => [1, 2, 3, 4, 5].slice(0, n).map(item)));
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(view.result.current.isSaving).toBe(false);
    done();
  });

  it('shows the just-published order while the index still holds the old one, and builds the next placement on it', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    state.indexLagMs = 300;
    const { view, done } = await renderSubmissions([item(0)]);

    let first: Published = null;
    await act(async () => {
      first = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
    });
    expect(first).toBeTruthy();

    // Same rank id, old order in the index: the pin must hold.
    await waitFor(() => expect(view.result.current.mySubmission?.orderedEntityIds).toEqual([item(0), item(1)]));
    expect(state.ranks[0].ids).toEqual([item(0)]);

    // The screen builds the next placement from what it shows.
    let second: Published = null;
    await act(async () => {
      const shown = view.result.current.mySubmission?.orderedEntityIds ?? [];
      second = await view.result.current.saveMySubmission(slots([...shown, item(2)]));
      await settle([first, second]);
    });

    expect(state.ranks[0].ids).toEqual([item(0), item(1), item(2)]);
    expect(lastToast()).toContain('Ranking published!');
    await waitFor(() =>
      expect(view.result.current.mySubmission?.orderedEntityIds).toEqual([item(0), item(1), item(2)])
    );
    done();
  });

  it('keeps both devices’ changes and tells the ranker', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(1)] }];
    const { view, done } = await renderSubmissions([item(1)]);
    // Another device publishes [1, 2]; this screen doesn't refetch.
    state.ranks[0].ids = [item(1), item(2)];

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(1), item(3)]));
      expect(published?.orderedEntityIds).toEqual([item(1), item(2), item(3)]);
      await published?.indexingSettled;
    });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ rankId: RANK }));
    expect(state.ranks[0].ids).toEqual([item(1), item(2), item(3)]);
    expect(lastToast()).toContain('We kept the changes from both');
    done();
  });

  it('says nothing about another device when the list is unchanged', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(1)] }];
    const { view, done } = await renderSubmissions([item(1)]);

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(2), item(1)]));
      expect(published?.orderedEntityIds).toEqual([item(2), item(1)]);
      await published?.indexingSettled;
    });

    expect(lastToast()).toContain('Ranking published!');
    done();
  });

  it('publishes nothing, and says why, when the merge leaves nothing', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(1), item(2)] }];
    const { view, done } = await renderSubmissions([item(1), item(2)]);
    // The phone removed 1; this device (stale) removes 2.
    state.ranks[0].ids = [item(2)];

    await act(async () => {
      expect(await view.result.current.saveMySubmission(slots([item(1)]))).toBeNull();
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "Your ranking changed on another device, so this change wasn't published. Check your ranking and try again."
    );
    await waitFor(() => expect(view.result.current.mySubmission?.orderedEntityIds).toEqual([item(2)]));
    done();
  });

  it('refuses to build on an index that has not caught up with the previous publish', async () => {
    state.indexes = false;
    Object.assign(rankingPublishTiming, { maxPollMs: 30 });
    const { view, done } = await renderSubmissions();

    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission([slot(item(1))]),
        view.result.current.saveMySubmission([slot(item(2))]),
      ]);
    });

    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeNull();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.reportError).toHaveBeenCalledWith(expect.stringContaining('still saving'));
    done();
  });

  it('stops blocking once an unread publish is older than the guard window', async () => {
    state.indexes = false;
    Object.assign(rankingPublishTiming, { maxPollMs: 20, ownPublishBlocksForMs: 40 });
    const { view, done } = await renderSubmissions();

    await act(async () => {
      const first = await view.result.current.saveMySubmission([slot(item(1))]);
      await first?.indexingSettled;
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(await view.result.current.saveMySubmission([slot(item(2))])).toBeTruthy();
    });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.reportError).not.toHaveBeenCalled();
    done();
  });

  it('merges instead of waiting when another device’s edit replaces ours before ours is read back', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    // Our first edit is overtaken: the index goes straight to another device's ballot.
    state.onSent = () => {
      state.ranks[0].ids = [item(0), item(9)];
    };

    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission(slots([item(0), item(1)])),
        view.result.current.saveMySubmission(slots([item(0), item(2)])),
      ]);
      await settle(results);
    });

    expect(results.every(Boolean)).toBe(true);
    // The overtaken placement (1) is folded back in, ahead of the next one (2).
    expect(state.sentBallots[1]).toEqual([item(0), item(9), item(1), item(2)]);
    expect(state.ranks[0].ids).toEqual([item(0), item(9), item(1), item(2)]);
    expect(lastToast()).toContain('another device');
    await waitFor(() =>
      expect(view.result.current.mySubmission?.orderedEntityIds).toEqual([item(0), item(9), item(1), item(2)])
    );
    // Only the two placements the ranker made were sent, and nothing is left unpublished.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(view.result.current.unsavedDraft).toBeNull();
    expect(mocks.reportError).not.toHaveBeenCalledWith(expect.stringContaining('still saving'));
    done();
  });

  it('hands an overtaken placement back as unpublished changes instead of publishing for the ranker', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    state.onSent = () => {
      state.ranks[0].ids = [item(0), item(9)];
      state.ranks[0].updatedAt = Date.now();
    };

    let settled: unknown = undefined;
    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
      settled = await published?.indexingSettled;
    });

    // No share image from a ballot that isn't ours.
    expect(settled).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(state.ranks[0].ids).toEqual([item(0), item(9)]);
    expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(9), item(1)]);
    expect(mocks.reportError).toHaveBeenCalledWith(OVERTAKEN);
    done();
  });

  it('keeps the other device’s change when our overtaken edit lands on top of it (review repro 1)', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    // The other device's [0, 9] is indexed first; ours lands after the poll's first read.
    state.onSent = edit => {
      state.ranks[0].ids = [item(0), item(9)];
      state.ranks[0].updatedAt = Date.now();
      setTimeout(() => applyToIndex(edit), 30);
    };

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
      await published?.indexingSettled;
    });
    await waitFor(() => expect(state.ranks[0].ids).toEqual([item(0), item(1)]));

    // 9 is not silently gone: both 1 and 9 are in the ranker's draft, and they're told.
    expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(9), item(1)]);
    expect(mocks.reportError).toHaveBeenCalledWith(OVERTAKEN);
    expect(mocks.send).toHaveBeenCalledTimes(1);

    // Publishing the draft puts both back.
    await act(async () => {
      const draft = view.result.current.unsavedDraft;
      const published = await view.result.current.saveMySubmission(slots(draft?.orderedEntityIds ?? []), undefined, {
        basedOnOrderedIds: draft?.baseOrderedIds,
      });
      await published?.indexingSettled;
    });
    expect(state.ranks[0].ids).toEqual([item(0), item(9), item(1)]);
    expect(view.result.current.unsavedDraft).toBeNull();
    done();
  });

  it('loses nothing when the other device edits again before the ranker republishes (review repro 2)', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    state.onSent = () => {
      state.ranks[0].ids = [item(0), item(9)];
      state.ranks[0].updatedAt = Date.now();
    };

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
      await published?.indexingSettled;
    });
    // Nothing is published for the ranker in the meantime.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(9), item(1)]);

    // The other device edits again.
    state.ranks[0].ids = [item(0), item(9), item(8)];
    state.ranks[0].updatedAt = Date.now();

    await act(async () => {
      const draft = view.result.current.unsavedDraft;
      const published = await view.result.current.saveMySubmission(slots(draft?.orderedEntityIds ?? []), undefined, {
        basedOnOrderedIds: draft?.baseOrderedIds,
      });
      await published?.indexingSettled;
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect([...state.ranks[0].ids].sort()).toEqual([item(0), item(1), item(8), item(9)].sort());
    done();
  });

  it('keeps a third device’s addition when the draft is published after a refetch (review round 4)', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    state.onSent = () => {
      state.ranks[0].ids = [item(0), item(9)];
      state.ranks[0].updatedAt = Date.now();
    };
    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
      await published?.indexingSettled;
    });
    expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(9), item(1)]);

    // A third device publishes [0, 9, 8], and this tab refetches.
    state.ranks[0].ids = [item(0), item(9), item(8)];
    state.ranks[0].updatedAt = Date.now();
    await act(async () => {
      await view.result.current.retryBallotRead();
    });
    // The draft is re-merged onto it.
    await waitFor(() =>
      expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(9), item(8), item(1)])
    );

    await act(async () => {
      const draft = view.result.current.unsavedDraft;
      const published = await view.result.current.saveMySubmission(slots(draft?.orderedEntityIds ?? []), undefined, {
        basedOnOrderedIds: draft?.baseOrderedIds,
      });
      await published?.indexingSettled;
    });
    expect(state.ranks[0].ids).toEqual([item(0), item(9), item(8), item(1)]);
    expect(view.result.current.unsavedDraft).toBeNull();
    done();
  });

  it('honours a removal made elsewhere after the hand-back, and drops the draft once it is published elsewhere', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);
    state.onSent = () => {
      state.ranks[0].ids = [item(0), item(9)];
      state.ranks[0].updatedAt = Date.now();
    };
    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(1)]));
      await published?.indexingSettled;
    });

    // Another device removes 9.
    state.ranks[0].ids = [item(0)];
    await act(async () => {
      await view.result.current.retryBallotRead();
    });
    await waitFor(() => expect(view.result.current.unsavedDraft?.orderedEntityIds).toEqual([item(0), item(1)]));

    // Another tab publishes exactly that: nothing is left unsaved.
    state.ranks[0].ids = [item(0), item(1)];
    await act(async () => {
      await view.result.current.retryBallotRead();
    });
    await waitFor(() => expect(view.result.current.unsavedDraft).toBeNull());
    done();
  });

  it('resolves indexing with the ballot the index read back, for the share image', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0)] }];
    const { view, done } = await renderSubmissions([item(0)]);

    let settled: unknown = undefined;
    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(1), item(0)]));
      settled = await published?.indexingSettled;
    });
    expect(settled).toEqual({ orderedEntityIds: [item(1), item(0)] });
    done();
  });

  it('treats a read older than the ballot it replaced as lagging, not as another device’s edit', async () => {
    const now = Date.now();
    state.ranks = [{ id: RANK, createdAt: now - 60_000, updatedAt: now - 1_000, ids: [item(0), item(5)] }];
    const { view, done } = await renderSubmissions([item(0), item(5)]);
    state.onSent = edit => {
      // A lagging read: the rank as it was before the ballot we built on.
      state.ranks[0].ids = [item(0)];
      state.ranks[0].updatedAt = now - 30_000;
      setTimeout(() => applyToIndex(edit), 40);
    };

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(0), item(5), item(1)]));
      await published?.indexingSettled;
    });

    expect(state.ranks[0].ids).toEqual([item(0), item(5), item(1)]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(lastToast()).toContain('Ranking published!');
    done();
  });

  it('keeps the rolling clock of a ballot edited in place while the index catches up', async () => {
    state.isRolling = true;
    state.submissionFrequencyHours = 24;
    const createdAt = Date.now() - 20 * 60 * 60 * 1000;
    state.ranks = [{ id: RANK, createdAt, ids: [item(0)] }];
    state.indexLagMs = 300;
    const { view, done } = await renderSubmissions([item(0)]);
    expect(view.result.current.submittedAtMs).toBe(createdAt);

    let published: Published = null;
    await act(async () => {
      published = await view.result.current.saveMySubmission(slots([item(1), item(0)]));
    });
    await waitFor(() => expect(view.result.current.mySubmission?.orderedEntityIds).toEqual([item(1), item(0)]));
    expect(state.ranks[0].ids).toEqual([item(0)]);
    expect(view.result.current.submittedAtMs).toBe(createdAt);
    await act(async () => {
      await published?.indexingSettled;
    });
    done();
  });

  it('reads a listed rank from the listing when the full read fails and the listing is whole', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(0), item(1)], unreadable: true }];
    const { view, done } = await renderSubmissions([item(0), item(1)]);
    expect(view.result.current.ballotReadError).toBeNull();

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(1), item(0)]));
      expect(published).toBeTruthy();
      await published?.indexingSettled;
    });
    expect(state.sentBallots[0]).toEqual([item(1), item(0)]);
    done();
  });

  it('says the ballot could not be read, and publishes nothing, when the listing may be truncated', async () => {
    const ids = Array.from({ length: 1_200 }, (_, n) => item(n));
    state.ranks = [{ id: RANK, createdAt: 1, ids, unreadable: true }];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
    const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Best debates'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const message = `We can't read your ranking on this block. Contact support with this id: ${RANK}`;
    await waitFor(() => expect(view.result.current.ballotReadError).toBe(message));

    await act(async () => {
      expect(await view.result.current.saveMySubmission(slots([item(5_000)]))).toBeNull();
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(message);
    view.unmount();
    client.clear();
  });

  it('lets a rolled-off rolling block publish a new rank over an unreadable one', async () => {
    state.isRolling = true;
    state.submissionFrequencyHours = 1;
    const ids = Array.from({ length: 1_200 }, (_, n) => item(n));
    state.ranks = [{ id: RANK, createdAt: Date.now() - 2 * 60 * 60 * 1000, ids, unreadable: true }];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
    const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Best debates'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.ballotReadError).toBeNull();

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(5_000)]));
      expect(published).toBeTruthy();
      await published?.indexingSettled;
    });
    expect(state.createdRanks).toBe(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(state.sentBallots[0]).toEqual([item(5_000)]);
    view.unmount();
    client.clear();
  });

  it('fails fast when the transaction reports failure, and the next placement does not wait on it', async () => {
    state.sendError = new Error('UserOperation reverted');
    Object.assign(rankingPublishTiming, { maxPollMs: 5_000 });
    const { view, done } = await renderSubmissions();

    const startedAt = Date.now();
    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission([slot(item(1))]),
        view.result.current.saveMySubmission([slot(item(2))]),
      ]);
      await settle(results);
    });

    expect(results[0]).toBeNull();
    expect(results[1]).toBeTruthy();
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(mocks.reportError).not.toHaveBeenCalledWith(expect.stringContaining('still saving'));
    expect(state.ranks[0].ids).toEqual([item(2)]);
    done();
  });

  it('reads and republishes a ballot of more than 1,000 items whole', async () => {
    const ids = Array.from({ length: 1_200 }, (_, n) => item(n));
    state.ranks = [{ id: RANK, createdAt: 1, ids }];
    const { view, done } = await renderSubmissions(ids);

    // Move the last item to the top, then add one more right behind it.
    const moved = [ids[1_199], ...ids.slice(0, 1_199)];
    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission(slots(moved)),
        view.result.current.saveMySubmission(slots([...moved, item(5_000)]), undefined, {
          basedOnOrderedIds: moved,
        }),
      ]);
      await settle(results);
    });

    expect(results.every(Boolean)).toBe(true);
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(state.sentBallots[0]).toEqual(moved);
    expect(state.ranks[0].ids).toEqual([...moved, item(5_000)]);
    done();
  });

  it('polls the rank itself, not the block listing, after editing an existing rank', async () => {
    state.ranks = [{ id: RANK, createdAt: 1, ids: [item(1)] }];
    state.indexLagMs = 60;
    const { view, done } = await renderSubmissions([item(1)]);
    const listingReadsBefore = mocks.listingReads.mock.calls.length;

    await act(async () => {
      const published = await view.result.current.saveMySubmission(slots([item(2), item(1)]));
      await published?.indexingSettled;
    });

    // One re-read before publishing, one refetch for the pin, one after settling; none per poll.
    expect(mocks.listingReads.mock.calls.length - listingReadsBefore).toBeLessThanOrEqual(3);
    expect(mocks.entityReads.mock.calls.length).toBeGreaterThan(3);
    done();
  });

  it('on a rolling block, a placement queued behind a new period’s ballot updates that new ballot', async () => {
    state.isRolling = true;
    state.submissionFrequencyHours = 1;
    state.ranks = [{ id: RANK, createdAt: Date.now() - 2 * 60 * 60 * 1000, ids: [item(0)] }];
    state.indexLagMs = 40;
    const { view, done } = await renderSubmissions([item(0)]);

    let results: Published[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission(slots([item(0), item(1)])),
        view.result.current.saveMySubmission(slots([item(0), item(2)])),
      ]);
      await settle(results);
    });

    const minted = `${'e'.repeat(31)}1`;
    expect(state.createdRanks).toBe(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ rankId: minted }));
    expect(state.ranks.find(r => r.id === minted)?.ids).toEqual([item(0), item(1), item(2)]);
    expect(state.ranks.find(r => r.id === RANK)?.ids).toEqual([item(0)]);
    done();
  });

  it('stops an oversized ballot with a clear message instead of publishing it', async () => {
    process.env.NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS = '3';
    const { view, done } = await renderSubmissions();

    await act(async () => {
      expect(await view.result.current.saveMySubmission([1, 2, 3, 4].map(n => slot(item(n))))).toBeNull();
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith('A ranking can hold up to 3 items. Remove 1 item to publish.');
    done();
  });
});
