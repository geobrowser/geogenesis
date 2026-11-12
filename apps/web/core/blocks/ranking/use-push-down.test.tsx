import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';

import { DEBATES_SPACE_ID } from './best-debates';
import { PUSH_DOWN_LAST_BALLOT_ITEM_COPY } from './push-down';
import { usePushDown } from './use-push-down';

const PERSONAL = 'd4bee0928fb5405baba3b1513f085835';
const DEBATE_SPACE = '1234567890abcdef1234567890abcdef';
const OTHER_SPACE = 'abcdefabcdefabcdefabcdefabcdefab';
const BLOCK = 'b10cb10cb10cb10cb10cb10cb10cb10c';
const DEBATE = 'deba7e00deba7e00deba7e00deba7e00';
const RANKED_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RANKED_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

type Either = { _tag: 'Right'; right: string } | { _tag: 'Left'; left: Error };

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
  serverResponse: null as 'positive' | 'negative' | null,
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
vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: () => mocks.runEffectEither(),
}));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: {
    responses: {
      downvote: (params: { authorSpaceId: string; spaceId: string; entityId: string }) => {
        mocks.events.push('downvote');
        return mocks.downvote(params);
      },
      unvote: (params: { authorSpaceId: string; spaceId: string; entityId: string }) => {
        mocks.events.push('unvote');
        return mocks.unvote(params);
      },
    },
  },
}));
vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return {
    getUserEntityResponse: () => Effect.succeed(mocks.serverResponse),
    getBatchEntities: () => Effect.succeed([]),
  };
});
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

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function deferredEither() {
  let resolve!: (value: Either) => void;
  const promise = new Promise<Either>(r => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.setToast.mockReset();
  mocks.runEffectEither.mockReset();
  mocks.runEffectEither.mockResolvedValue({ _tag: 'Right', right: '0xop' });
  mocks.downvote.mockClear();
  mocks.unvote.mockClear();
  mocks.save.mockReset();
  mocks.save.mockResolvedValue({ rankEntityId: 'rank1' });
  mocks.serverResponse = null;
  mocks.orderedEntityIds = [];
  mocks.rankEntity = null;
  mocks.events = [];
});

afterEach(() => cleanup());

describe('usePushDown', () => {
  it('stays off until the Best debates block exists', async () => {
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: null }), { wrapper: wrapper() });
    expect(result.current.enabled).toBe(false);
    await act(async () => {
      await result.current.pushDown();
    });
    expect(mocks.downvote).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('downvotes in the debate’s own space, never the Debates or the member’s space', async () => {
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    expect(result.current.enabled).toBe(true);
    expect(result.current.debateSpaceId).toBe(DEBATE_SPACE);

    await act(async () => {
      await result.current.pushDown();
    });

    expect(mocks.downvote).toHaveBeenCalledWith({ authorSpaceId: PERSONAL, spaceId: DEBATE_SPACE, entityId: DEBATE });
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'push-down' }));
    expect(mocks.setToast).toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({
        action_kind: 'push_down',
        target_type: 'debate',
        target_id: DEBATE,
        outcome: 'succeeded',
      })
    );
  });

  it('takes a ranked debate off the ballot only after the downvote has landed', async () => {
    rankedBallot([RANKED_A, DEBATE, RANKED_B]);
    const vote = deferredEither();
    mocks.runEffectEither.mockReturnValueOnce(vote.promise);

    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isInBallot).toBe(true));

    let running!: Promise<unknown>;
    act(() => {
      running = result.current.pushDown();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'working', step: 'vote' }));
    expect(mocks.save).not.toHaveBeenCalled();

    await act(async () => {
      vote.resolve({ _tag: 'Right', right: '0xop' });
      await running;
    });

    expect(mocks.events).toEqual(['downvote', 'ballot']);
    // Every other vote keeps the space it was ranked in.
    expect(mocks.save).toHaveBeenCalledWith([
      { id: RANKED_A, name: null, spaceId: DEBATE_SPACE },
      { id: RANKED_B, name: null, spaceId: OTHER_SPACE },
    ]);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'push-down' }));
  });

  it('keeps a failed ballot edit for a retry, without sending the downvote again', async () => {
    rankedBallot([RANKED_A, DEBATE]);
    mocks.save.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await act(async () => {
      await result.current.pushDown();
    });

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'failed', action: 'push-down', step: 'ballot' })
    );
    // Shows as both until the retry finishes.
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));
    await waitFor(() => expect(result.current.isInBallot).toBe(true));

    await act(async () => {
      await result.current.retry();
    });
    expect(mocks.downvote).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'push-down' }));
  });

  it('does not touch the ballot when the downvote fails', async () => {
    rankedBallot([RANKED_A, DEBATE]);
    mocks.runEffectEither.mockResolvedValueOnce({ _tag: 'Left', left: new Error('rejected') });

    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await act(async () => {
      await result.current.pushDown();
    });

    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'failed', step: 'vote' }));
    await waitFor(() => expect(result.current.isPushedDown).toBe(false));
  });

  it('can’t empty the ballot, and says so', async () => {
    rankedBallot([DEBATE]);
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
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

  it('ranking a pushed-down debate clears the downvote first, then publishes', async () => {
    mocks.serverResponse = 'negative';
    const clear = deferredEither();
    mocks.runEffectEither.mockReturnValueOnce(clear.promise);
    const publish = vi.fn(async () => {
      mocks.events.push('publish');
      return true;
    });

    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));

    let running!: Promise<unknown>;
    act(() => {
      running = result.current.rankAfterClearing(publish);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'working', step: 'vote' }));
    expect(publish).not.toHaveBeenCalled();

    await act(async () => {
      clear.resolve({ _tag: 'Right', right: '0xop' });
      await running;
    });
    expect(mocks.events).toEqual(['unvote', 'publish']);
    expect(mocks.unvote).toHaveBeenCalledWith({ authorSpaceId: PERSONAL, spaceId: DEBATE_SPACE, entityId: DEBATE });
    await waitFor(() => expect(result.current.isPushedDown).toBe(false));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'rank' }));
  });

  it('retries only the publish when ranking’s second step failed', async () => {
    mocks.serverResponse = 'negative';
    const publish = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));
    await act(async () => {
      await result.current.rankAfterClearing(publish);
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'failed', action: 'rank', step: 'ballot' })
    );

    await act(async () => {
      await result.current.retry();
    });
    expect(mocks.unvote).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'done', action: 'rank' }));
  });

  it('Undo clears the downvote and leaves the ballot alone', async () => {
    mocks.serverResponse = 'negative';
    const { result } = renderHook(() => usePushDown(DEBATE, { blockId: BLOCK }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPushedDown).toBe(true));

    await act(async () => {
      await result.current.undo();
    });

    expect(mocks.unvote).toHaveBeenCalledWith({ authorSpaceId: PERSONAL, spaceId: DEBATE_SPACE, entityId: DEBATE });
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isPushedDown).toBe(false));
    expect(mocks.capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({ action_kind: 'undo_push_down', target_id: DEBATE })
    );
  });
});
