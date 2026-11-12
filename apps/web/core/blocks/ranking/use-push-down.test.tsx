import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';

import { DEBATES_SPACE_ID } from './best-debates';
import type { MemberVoteRecord } from './fetch-member-debate-votes';
import { PUSH_DOWN_LAST_BALLOT_ITEM_COPY } from './push-down';
import { type ComposeBallot, RankingComposeBallotContext } from './ranking-compose-ballot-context';
import { usePushDown } from './use-push-down';

const PERSONAL = 'd4bee0928fb5405baba3b1513f085835';
const DEBATE_SPACE = '1234567890abcdef1234567890abcdef';
const CLAIM_SPACE = 'c1a1c1a1c1a1c1a1c1a1c1a1c1a1c1a1';
const OTHER_SPACE = 'abcdefabcdefabcdefabcdefabcdefab';
const BLOCK = 'b10cb10cb10cb10cb10cb10cb10cb10c';
const DEBATE = 'deba7e00deba7e00deba7e00deba7e00';
const RANKED_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RANKED_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DRAFT_ONLY = 'dddddddddddddddddddddddddddddddd';

type Either = { _tag: 'Right'; right: string } | { _tag: 'Left'; left: Error };
type VoteParams = { authorSpaceId: string; spaceId: string; entityId: string };

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  setToast: vi.fn(),
  runEffectEither: vi.fn<() => Promise<Either>>(),
  downvote: vi.fn((_params: { authorSpaceId: string; spaceId: string; entityId: string }) => ({
    to: '0xdown' as const,
    calldata: '0x01' as const,
  })),
  unvote: vi.fn((_params: { authorSpaceId: string; spaceId: string; entityId: string }) => ({
    to: '0xclear' as const,
    calldata: '0x02' as const,
  })),
  save: vi.fn<(slots: Array<{ id: string; spaceId?: string }>) => Promise<object | null>>(),
  serverRecords: [] as MemberVoteRecord[] | Error,
  serverReads: 0,
  gate: null as Promise<void> | null,
  since: 1_790_000_000 as number | null,
  readSince: [] as Array<number | null | undefined>,
  orderedEntityIds: [] as string[],
  rankEntity: null as object | null,
  events: [] as string[],
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/hooks/use-personal-space-id', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-personal-space-id')>()),
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL, isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/hooks/use-smart-account-transaction', async () => {
  const { Effect } = await import('effect');
  return { useSmartAccountTransaction: () => () => Effect.succeed('0xtx') };
});
vi.mock('~/core/telemetry/effect-runtime', () => ({ runEffectEither: () => mocks.runEffectEither() }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: {
    responses: {
      downvote: (params: VoteParams) => {
        mocks.events.push(`downvote:${params.spaceId}`);
        return mocks.downvote(params);
      },
      unvote: (params: VoteParams) => {
        mocks.events.push(`unvote:${params.spaceId}`);
        return mocks.unvote(params);
      },
    },
  },
}));
vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return {
    getUserEntityResponse: () => Effect.succeed(null),
    getBatchEntities: () => Effect.succeed([]),
  };
});
// Indexing never confirms in these tests, so this session's overlays stay in charge.
vi.mock('~/core/utils/wait-for-indexed-value', () => ({ waitForIndexedValue: () => new Promise(() => {}) }));
vi.mock('./best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debates')>()),
  get BEST_DEBATES_PUSHDOWN_SINCE() {
    return mocks.since;
  },
}));
vi.mock('./fetch-member-debate-votes', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-member-debate-votes')>()),
  fetchMemberDebateVotes: async (_member: string, _debate: string, options?: { since?: number | null }) => {
    mocks.readSince.push(options?.since);
    mocks.serverReads += 1;
    if (mocks.gate) await mocks.gate;
    if (mocks.serverRecords instanceof Error) throw mocks.serverRecords;
    return mocks.serverRecords;
  },
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({
    entity: {
      spaces: [DEBATES_SPACE_ID, DEBATE_SPACE],
      values: [{ property: { id: SystemIds.NAME_PROPERTY }, spaceId: DEBATE_SPACE, value: 'A debate' }],
    },
    isLoading: false,
  }),
}));
vi.mock('./use-my-ranking', () => ({
  useMyRanking: () => ({ myRankEntity: mocks.rankEntity, orderedEntityIds: mocks.orderedEntityIds }),
}));
vi.mock('./use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    saveMySubmission: (slots: Array<{ id: string; spaceId?: string }>) => {
      mocks.events.push('ballot');
      return mocks.save(slots);
    },
  }),
}));

const down = (spaceId: string): MemberVoteRecord => ({
  objectId: DEBATE,
  spaceId,
  direction: 'negative',
  votedAt: '2026-11-01T00:00:00Z',
});
const up = (spaceId: string): MemberVoteRecord => ({ ...down(spaceId), direction: 'positive' });

function voteRelation(to: string, toSpaceId: string) {
  return {
    id: `r-${to}`,
    entityId: `r-${to}`,
    type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
    fromEntity: { id: 'rank1', name: null },
    toEntity: { id: to, name: null, value: to },
    spaceId: PERSONAL,
    toSpaceId,
  };
}

function rankedBallot(ids: string[]) {
  mocks.orderedEntityIds = ids;
  mocks.rankEntity = {
    id: 'rank1',
    relations: ids.map(id => voteRelation(id, id === RANKED_B ? OTHER_SPACE : DEBATE_SPACE)),
  };
}

function wrapper(ballot: ComposeBallot | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RankingComposeBallotContext.Provider value={ballot}>{children}</RankingComposeBallotContext.Provider>
    </QueryClientProvider>
  );
}

function deferredEither() {
  let resolve!: (value: Either) => void;
  const promise = new Promise<Either>(r => (resolve = r));
  return { promise, resolve };
}

async function renderReady(ballot: ComposeBallot | null = null) {
  const view = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper(ballot) });
  await waitFor(() => expect(view.result.current.enabled).toBe(true));
  return view;
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.setToast.mockReset();
  mocks.runEffectEither.mockReset();
  mocks.runEffectEither.mockResolvedValue({ _tag: 'Right', right: '0xop' });
  mocks.downvote.mockClear();
  mocks.unvote.mockClear();
  mocks.save.mockReset();
  mocks.save.mockResolvedValue({ rankEntityId: 'rank1', indexingSettled: Promise.resolve() });
  mocks.serverRecords = [];
  mocks.serverReads = 0;
  mocks.gate = null;
  mocks.since = 1_790_000_000;
  mocks.readSince = [];
  mocks.orderedEntityIds = [];
  mocks.rankEntity = null;
  mocks.events = [];
});

afterEach(() => cleanup());

describe('usePushDown', () => {
  it('reads only votes cast since the push-down launch', async () => {
    await renderReady();
    expect(mocks.readSince).toContain(1_790_000_000);
  });

  it('before push-down launches, only this session’s own push-down shows', async () => {
    mocks.since = null;
    mocks.serverRecords = [down(DEBATE_SPACE)];
    const { result } = await renderReady();
    // The server's downvote predates the launch, so it doesn't count and isn't even read.
    expect(mocks.serverReads).toBe(0);
    expect(result.current.isPushedDown).toBe(false);

    await act(async () => {
      await result.current.pushDown();
    });
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));
  });

  it('stays off until the Best debates block exists', async () => {
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: null }), { wrapper: wrapper() });
    expect(result.current.enabled).toBe(false);
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.downvote).not.toHaveBeenCalled();
  });

  it('waits for the member’s current vote before it can be used', async () => {
    let release!: () => void;
    mocks.gate = new Promise<void>(r => (release = r));
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    // Before the read resolves nothing is known, so the entry points are off.
    expect(result.current.isVoteKnown).toBe(false);
    expect(result.current.enabled).toBe(false);
    // A press now waits on the read: nothing is sent until the vote is known.
    let running!: Promise<unknown>;
    act(() => {
      running = result.current.pushDown();
    });
    await new Promise(r => setTimeout(r, 20));
    expect(mocks.downvote).not.toHaveBeenCalled();
    release();
    await act(async () => {
      await running;
    });
    expect(mocks.downvote).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it('downvotes in the debate’s own space, and reads the vote fresh at the press', async () => {
    const { result } = await renderReady();
    const readsBefore = mocks.serverReads;

    await act(async () => {
      await result.current.pushDown();
    });

    expect(mocks.serverReads).toBeGreaterThan(readsBefore);
    expect(mocks.downvote).toHaveBeenCalledWith({ authorSpaceId: PERSONAL, spaceId: DEBATE_SPACE, entityId: DEBATE });
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'push-down' }));
    expect(mocks.capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({ action_kind: 'push_down', target_type: 'debate', target_id: DEBATE })
    );
  });

  it('sends the downvote even when one already shows, so a stale answer never skips it', async () => {
    mocks.serverRecords = [down(DEBATE_SPACE)];
    const { result } = await renderReady();
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.downvote).toHaveBeenCalledTimes(1);
  });

  it('logs pushing down an upvoted debate as a switch', async () => {
    mocks.serverRecords = [up(DEBATE_SPACE)];
    const { result } = await renderReady();
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      'vote_cast',
      expect.objectContaining({ vote_action: 'switch', previous_vote_direction: 'up', vote_direction: 'down' })
    );
  });

  it('takes a ranked debate off the published ballot only after the downvote has landed', async () => {
    rankedBallot([RANKED_A, DEBATE, RANKED_B]);
    const { result } = await renderReady();
    const vote = deferredEither();
    mocks.runEffectEither.mockReturnValueOnce(vote.promise);

    let running!: Promise<unknown>;
    act(() => {
      running = result.current.pushDown();
    });
    await waitFor(() => expect(mocks.downvote).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled();

    await act(async () => {
      vote.resolve({ _tag: 'Right', right: '0xop' });
      await running;
    });

    expect(mocks.events).toEqual([`downvote:${DEBATE_SPACE}`, 'ballot']);
    expect(mocks.save).toHaveBeenCalledWith([
      { id: RANKED_A, name: null, spaceId: DEBATE_SPACE },
      { id: RANKED_B, name: null, spaceId: OTHER_SPACE },
    ]);
  });

  it('on the ranking screen, edits and publishes the draft rather than the published ballot', async () => {
    rankedBallot([RANKED_A, DEBATE]);
    const publish = vi.fn(async (_ids: string[]) => true);
    const { result } = await renderReady({ orderedIds: [RANKED_A, DEBATE, DRAFT_ONLY], publish });

    await act(async () => {
      await result.current.pushDown();
    });

    expect(publish).toHaveBeenCalledWith([RANKED_A, DRAFT_ONLY]);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps a failed ballot edit for a retry that only edits the ballot', async () => {
    rankedBallot([RANKED_A, DEBATE]);
    mocks.save.mockResolvedValueOnce(null);
    const { result } = await renderReady();

    await act(async () => {
      await result.current.pushDown();
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        action: 'push-down',
        step: 'ballot',
        partly: true,
      })
    );
    // Shows as both until the retry finishes.
    expect(result.current.isPushedDown).toBe(true);
    expect(result.current.isInBallot).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    expect(mocks.downvote).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'push-down' }));
  });

  it('does not touch the ballot when the downvote fails, and reports it as a failure', async () => {
    rankedBallot([RANKED_A, DEBATE]);
    mocks.runEffectEither.mockResolvedValueOnce({ _tag: 'Left', left: new Error('User rejected the request') });
    const { result } = await renderReady();

    await act(async () => {
      await result.current.pushDown();
    });

    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'failed', step: 'vote', partly: false }));
    expect(mocks.capture).toHaveBeenCalledWith('action_failed', expect.objectContaining({ action_kind: 'push_down' }));
  });

  it('fails without writing when the vote can’t be read', async () => {
    const { result } = await renderReady();
    mocks.serverRecords = new Error('down');
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.downvote).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'failed', step: 'vote' }));
  });

  it('can’t empty the ballot, and says so', async () => {
    rankedBallot([DEBATE]);
    const { result } = await renderReady();
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        step: 'ballot',
        message: PUSH_DOWN_LAST_BALLOT_ITEM_COPY,
      })
    );
  });

  it('Rank it publishes first, then clears every downvote the member holds, wherever it was cast', async () => {
    mocks.serverRecords = [down(DEBATE_SPACE), down(CLAIM_SPACE)];
    const publish = vi.fn(async () => {
      mocks.events.push('publish');
      return true;
    });
    const { result } = await renderReady();
    await waitFor(() => expect(result.current.downvotedSpaceIds).toEqual([DEBATE_SPACE, CLAIM_SPACE]));

    await act(async () => {
      await result.current.rank(publish);
    });

    expect(mocks.events).toEqual(['publish', `unvote:${DEBATE_SPACE}`, `unvote:${CLAIM_SPACE}`]);
    await waitFor(() => expect(result.current.isPushedDown).toBe(false));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'rank' }));
  });

  it('a failed Rank it publish leaves the downvote alone, so the debate is never neither', async () => {
    mocks.serverRecords = [down(DEBATE_SPACE)];
    const { result } = await renderReady();
    await act(async () => {
      await result.current.rank(async () => false);
    });
    expect(mocks.unvote).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'failed', action: 'rank', step: 'ballot', partly: false })
    );
  });

  it('after a published Rank it whose clear failed, Retry only clears', async () => {
    mocks.serverRecords = [down(DEBATE_SPACE)];
    const publish = vi.fn(async () => true);
    const { result } = await renderReady();
    mocks.runEffectEither.mockResolvedValueOnce({ _tag: 'Left', left: new Error('rejected') });

    await act(async () => {
      await result.current.rank(publish);
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'failed', action: 'rank', step: 'vote', partly: true })
    );

    await act(async () => {
      await result.current.retry();
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(mocks.unvote).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'rank' }));
  });

  it('Undo clears the downvote in each space it was cast in, and leaves the ballot alone', async () => {
    mocks.serverRecords = [down(CLAIM_SPACE), down(DEBATE_SPACE)];
    const { result } = await renderReady();

    await act(async () => {
      await result.current.undo();
    });

    expect(mocks.unvote).toHaveBeenNthCalledWith(1, {
      authorSpaceId: PERSONAL,
      spaceId: CLAIM_SPACE,
      entityId: DEBATE,
    });
    expect(mocks.unvote).toHaveBeenNthCalledWith(2, {
      authorSpaceId: PERSONAL,
      spaceId: DEBATE_SPACE,
      entityId: DEBATE,
    });
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isPushedDown).toBe(false));
    expect(mocks.capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({ action_kind: 'undo_push_down', target_id: DEBATE })
    );
  });

  it('keeps an overlay over a stale read only in the spaces it wrote', async () => {
    mocks.serverRecords = [down(CLAIM_SPACE)];
    const { result } = await renderReady();
    await act(async () => {
      await result.current.pushDown();
    });
    // The server still lags; the next action sees both the new and the old downvote.
    await act(async () => {
      await result.current.undo();
    });
    expect(mocks.unvote.mock.calls.map(([params]) => params.spaceId).sort()).toEqual(
      [CLAIM_SPACE, DEBATE_SPACE].sort()
    );
  });
});
