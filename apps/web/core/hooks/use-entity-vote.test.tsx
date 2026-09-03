import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userEntityVotesQueryKey, votedEntityIdsPendingQueryKey } from '~/core/hooks/use-user-voted-entity-ids';
import { entityResponseIndexingQueryKey } from '~/core/responses/entity-response';

import {
  responseIndexingRetryDelayMs,
  useEntityResponse,
  useEntityResponseIndexingSnapshot,
  useEntityResponseIndexingState,
} from './use-entity-vote';
import { personalSpaceIdQueryKey } from './use-personal-space-id';

const PERSONAL_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const TARGET_SPACE_ID = '1234567890abcdef1234567890abcdef';

/**
 * Refetching the voted lists before the indexer has the vote just reloads the
 * state from before it, so nothing may invalidate them until reconciliation.
 */
function expectNoVotedListRefresh(invalidateQueries: MockInstance, personalSpaceId = PERSONAL_SPACE_ID) {
  expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(personalSpaceId, 'up') });
  expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(personalSpaceId, 'down') });
}

function expectVotedListsRefreshed(invalidateQueries: MockInstance, personalSpaceId = PERSONAL_SPACE_ID) {
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(personalSpaceId, 'up') });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(personalSpaceId, 'down') });
}

const mocks = vi.hoisted(() => ({
  fetchResponse:
    vi.fn<(signal?: AbortSignal) => 'positive' | 'negative' | null | Promise<'positive' | 'negative' | null>>(),
  runEffectEither: vi.fn(),
  responseAction: vi.fn(() => ({ to: '0x1234' as const, calldata: '0xabcd' as const })),
  waitForIndexedEntityResponse: vi.fn(),
  loadResponseSummaryCaches: vi.fn(),
  personalSpaceId: 'd4bee0928fb5405baba3b1513f085835' as string | null,
  ensureSpaceMembership: vi.fn(),
}));

vi.mock('~/core/access/request-space-membership', () => ({
  ensureSpaceMembership: (...args: unknown[]) => mocks.ensureSpaceMembership(...args),
}));

vi.mock('~/core/responses/entity-response', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/responses/entity-response')>();
  mocks.waitForIndexedEntityResponse.mockImplementation(actual.waitForIndexedEntityResponse);
  return {
    ...actual,
    waitForIndexedEntityResponse: (...args: Parameters<typeof actual.waitForIndexedEntityResponse>) =>
      mocks.waitForIndexedEntityResponse(...args),
  };
});

vi.mock('~/core/hooks/use-personal-space-id', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-personal-space-id')>()),
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: mocks.personalSpaceId !== null }),
}));

vi.mock('~/core/hooks/use-smart-account-transaction', async () => {
  const { Effect } = await import('effect');
  return { useSmartAccountTransaction: () => () => Effect.succeed('0xtransaction') };
});

vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return {
    getUserEntityResponse: (...args: unknown[]) =>
      Effect.tryPromise(() => Promise.resolve(mocks.fetchResponse(args[5] as AbortSignal | undefined))),
  };
});

vi.mock('~/core/sdk/geo-client', () => ({
  geo: {
    responses: {
      upvote: mocks.responseAction,
      downvote: mocks.responseAction,
      unvote: mocks.responseAction,
      agree: mocks.responseAction,
      disagree: mocks.responseAction,
      unagree: mocks.responseAction,
      verify: mocks.responseAction,
      dispute: mocks.responseAction,
      unverify: mocks.responseAction,
    },
  },
}));

vi.mock('~/core/responses/claim-response-summaries', () => ({
  claimResponseSummariesQueryKeyPrefix: (personalSpaceId: string | null, spaceId: string) => [
    'claim-response-summaries',
    personalSpaceId,
    spaceId,
  ],
  loadClaimResponseSummaryCaches: (...args: unknown[]) => mocks.loadResponseSummaryCaches(...args),
}));

vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: (...args: unknown[]) => mocks.runEffectEither(...args),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchResponse.mockReset();
  mocks.runEffectEither.mockReset();
  mocks.responseAction.mockClear();
  mocks.waitForIndexedEntityResponse.mockClear();
  mocks.loadResponseSummaryCaches.mockReset();
  mocks.loadResponseSummaryCaches.mockResolvedValue(new Map());
  mocks.runEffectEither.mockResolvedValue({ _tag: 'Right', right: '0xtransaction' });
  mocks.personalSpaceId = PERSONAL_SPACE_ID;
  mocks.ensureSpaceMembership.mockReset();
  mocks.ensureSpaceMembership.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useEntityResponse indexing reconciliation', () => {
  it('exposes the expected optimistic response before the transaction settles', async () => {
    const transaction = deferred<unknown>();
    mocks.runEffectEither.mockReturnValue(transaction.promise);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        response: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexing: useEntityResponseIndexingSnapshot({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.response.submitResponse('negative'));
    await act(async () => Promise.resolve());

    expect(result.current.indexing).toMatchObject({
      status: 'reconciling',
      pending: { expectedResponse: 'negative' },
    });
  });

  it('keeps a submitted response unsettled and retries automatically after reconciliation exhausts', async () => {
    mocks.fetchResponse.mockReturnValue(null);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive', { onSuccess, onError }));
    await act(async () => Promise.resolve());

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isProcessingResponse).toBe(true);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    const initialRunId = queryClient.getQueryData<{ runId: string }>(
      entityResponseIndexingQueryKey(PERSONAL_SPACE_ID, 'claim-1', TARGET_SPACE_ID, 'stance')
    )?.runId;

    await act(async () => vi.advanceTimersByTimeAsync(58_000));

    expect(mocks.fetchResponse).toHaveBeenCalledTimes(30);
    expect(result.current.isProcessingResponse).toBe(true);
    expect(result.current.isResponseIndexingDelayed).toBe(true);
    expectNoVotedListRefresh(invalidateQueries);
    expect(
      queryClient.getQueryData<{ runId: string }>(
        entityResponseIndexingQueryKey(PERSONAL_SPACE_ID, 'claim-1', TARGET_SPACE_ID, 'stance')
      )?.runId
    ).toBe(initialRunId);

    mocks.fetchResponse.mockReturnValue('positive');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(result.current.isProcessingResponse).toBe(false);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    expect(result.current.optimisticResponse).toBeUndefined();
    expect(mocks.loadResponseSummaryCaches).toHaveBeenCalledWith(
      expect.objectContaining({
        queryClient,
        spaceId: TARGET_SPACE_ID,
        personalSpaceId: PERSONAL_SPACE_ID,
        targets: [{ entityId: 'claim-1', responseKind: 'stance' }],
      })
    );
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: ['claim-response-summaries', PERSONAL_SPACE_ID, TARGET_SPACE_ID],
    });
    expectVotedListsRefreshed(invalidateQueries);
  });

  it('isolates optimistic response state by personal space', async () => {
    const transaction = deferred<unknown>();
    mocks.runEffectEither.mockReturnValue(transaction.promise);
    const { wrapper } = createHarness();
    const { result, rerender } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => Promise.resolve());
    expect(result.current.optimisticResponse).toBe('positive');

    mocks.personalSpaceId = 'another-personal-space';
    rerender();

    expect(result.current.optimisticResponse).toBeUndefined();
  });

  it('stays visibly processing after submission and invalidates when Gaia indexes late', async () => {
    let fetchCount = 0;
    mocks.fetchResponse.mockImplementation(() => (++fetchCount >= 2 ? 'positive' : null));
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => Promise.resolve());

    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.isProcessingResponse).toBe(true);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    expectNoVotedListRefresh(invalidateQueries);

    await act(async () => vi.advanceTimersByTimeAsync(2_000));

    expect(mocks.fetchResponse).toHaveBeenCalledTimes(2);
    expect(result.current.isProcessingResponse).toBe(false);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    expect(result.current.optimisticResponse).toBeUndefined();
    expect(mocks.loadResponseSummaryCaches).toHaveBeenCalledOnce();
    expectVotedListsRefreshed(invalidateQueries);
  });

  it('keeps reconciliation recoverable when the single-claim summary refresh fails', async () => {
    mocks.fetchResponse.mockReturnValue('positive');
    mocks.loadResponseSummaryCaches.mockRejectedValueOnce(new Error('summary unavailable'));
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isResponseIndexingDelayed).toBe(true);
    expect(mocks.loadResponseSummaryCaches).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.loadResponseSummaryCaches).toHaveBeenCalledTimes(2);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
  });

  it('preserves individual cache invalidation for non-Claim curation votes', async () => {
    mocks.fetchResponse.mockReturnValue('positive');
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'entity-1', spaceId: TARGET_SPACE_ID, responseKind: 'curation' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.loadResponseSummaryCaches).not.toHaveBeenCalled();
    // The three reconcile invalidations, plus one per voted list once indexing confirmed, plus the
    // onboarding checklist — which reads a step out of this same table and caches for a minute, so
    // it has to be told rather than left to notice (GEO-2800).
    expectVotedListsRefreshed(invalidateQueries);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['curator-onboarding-status'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(6);
  });

  it('shows a claim response in its tab optimistically, before indexing confirms it', async () => {
    mocks.fetchResponse.mockReturnValue(null);
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'veracity' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('negative'));
    await act(async () => Promise.resolve());

    // Added to Downvoted and dropped from Upvoted right away...
    expect(setQueryData).toHaveBeenCalledWith(
      votedEntityIdsPendingQueryKey(PERSONAL_SPACE_ID, 'down'),
      expect.any(Function)
    );
    expect(setQueryData).toHaveBeenCalledWith(userEntityVotesQueryKey(PERSONAL_SPACE_ID, 'up'), expect.any(Function));
    // ...but the server lists are left alone until the vote is actually indexed.
    expectNoVotedListRefresh(invalidateQueries);

    expect(queryClient.getQueryData(votedEntityIdsPendingQueryKey(PERSONAL_SPACE_ID, 'down'))).toEqual({
      added: [expect.objectContaining({ entityId: 'claim-1', voteKind: 2 })],
      removed: [],
    });
  });

  // The reactive personal space id is null while a queued vote replays after a
  // remount; keying the lists off it would write them where nothing reads.
  it('keys the voted lists off the space the response actually used', async () => {
    mocks.fetchResponse.mockReturnValue('positive');
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(['smart-account', 'test'], { account: { address: '0xwriter' } });
    queryClient.setQueryData(personalSpaceIdQueryKey('0xwriter'), {
      personalSpaceId: PERSONAL_SPACE_ID,
      isRegistered: true,
    });
    mocks.personalSpaceId = null;
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'entity-1', spaceId: TARGET_SPACE_ID, responseKind: 'curation' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => Promise.resolve());

    expect(setQueryData).toHaveBeenCalledWith(
      votedEntityIdsPendingQueryKey(PERSONAL_SPACE_ID, 'up'),
      expect.any(Function)
    );
    expect(setQueryData).not.toHaveBeenCalledWith(votedEntityIdsPendingQueryKey(null, 'up'), expect.any(Function));
  });

  it('does not let an older control supersede shared indexing state', async () => {
    const firstTransaction = deferred<unknown>();
    const secondTransaction = deferred<unknown>();
    mocks.runEffectEither.mockReturnValueOnce(firstTransaction.promise).mockReturnValueOnce(secondTransaction.promise);
    mocks.fetchResponse.mockReturnValue(null);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        first: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        second: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexingStatus: useEntityResponseIndexingState({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.first.submitResponse('positive'));
    await act(async () => Promise.resolve());
    act(() => result.current.second.submitResponse('negative'));
    await act(async () => Promise.resolve());
    expect(result.current.first.optimisticResponse).toBe('negative');

    await act(async () => {
      secondTransaction.resolve({ _tag: 'Right', right: '0xsecond' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.indexingStatus).toBe('reconciling');
    expect(result.current.first.optimisticResponse).toBe('negative');

    await act(async () => {
      firstTransaction.resolve({ _tag: 'Right', right: '0xfirst' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.indexingStatus).toBe('reconciling');
  });

  it('resumes an older successful submission when a newer transaction fails', async () => {
    const firstTransaction = deferred<unknown>();
    const secondTransaction = deferred<unknown>();
    mocks.runEffectEither.mockReturnValueOnce(firstTransaction.promise).mockReturnValueOnce(secondTransaction.promise);
    mocks.fetchResponse.mockReturnValue('positive');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        first: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        second: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexingStatus: useEntityResponseIndexingState({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.first.submitResponse('positive'));
    await act(async () => Promise.resolve());
    act(() => result.current.second.submitResponse('negative'));
    await act(async () => Promise.resolve());

    await act(async () => {
      secondTransaction.resolve({ _tag: 'Left', left: new Error('rejected') });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.indexingStatus).toBe('reconciling');
    expect(result.current.first.optimisticResponse).toBe('positive');

    await act(async () => {
      firstTransaction.resolve({ _tag: 'Right', right: '0xfirst' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.indexingStatus).toBe('idle');
    consoleError.mockRestore();
  });

  it('resumes the oldest submission after two newer overlapping transactions fail', async () => {
    const firstTransaction = deferred<unknown>();
    const secondTransaction = deferred<unknown>();
    const thirdTransaction = deferred<unknown>();
    mocks.runEffectEither
      .mockReturnValueOnce(firstTransaction.promise)
      .mockReturnValueOnce(secondTransaction.promise)
      .mockReturnValueOnce(thirdTransaction.promise);
    mocks.fetchResponse.mockReturnValue('positive');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        first: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        second: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        third: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexingStatus: useEntityResponseIndexingState({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.first.submitResponse('positive'));
    await act(async () => Promise.resolve());
    act(() => result.current.second.submitResponse('negative'));
    await act(async () => Promise.resolve());
    act(() => result.current.third.submitResponse('positive'));
    await act(async () => Promise.resolve());

    await act(async () => {
      secondTransaction.resolve({ _tag: 'Left', left: new Error('second rejected') });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.indexingStatus).toBe('reconciling');

    await act(async () => {
      thirdTransaction.resolve({ _tag: 'Left', left: new Error('third rejected') });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.indexingStatus).toBe('reconciling');
    expect(result.current.first.optimisticResponse).toBe('positive');

    await act(async () => {
      firstTransaction.resolve({ _tag: 'Right', right: '0xfirst' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.indexingStatus).toBe('idle');
    consoleError.mockRestore();
  });

  it('aborts an active polling run when another control submits', async () => {
    mocks.fetchResponse
      .mockImplementationOnce(
        signal =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
      .mockReturnValue('negative');
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        first: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        second: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexingStatus: useEntityResponseIndexingState({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.first.submitResponse('positive'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();

    act(() => result.current.second.submitResponse('negative'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.fetchResponse).toHaveBeenCalledTimes(2);
    expect(result.current.indexingStatus).toBe('idle');
  });

  it('does not let a cancelled attempt clobber a restarted reconciliation for the same submission', async () => {
    const firstReconciliation = deferred<boolean>();
    const restartedReconciliation = deferred<boolean>();
    const secondTransaction = deferred<unknown>();
    mocks.waitForIndexedEntityResponse
      .mockImplementationOnce(() => firstReconciliation.promise)
      .mockImplementationOnce(() => restartedReconciliation.promise);
    mocks.runEffectEither
      .mockResolvedValueOnce({ _tag: 'Right', right: '0xfirst' })
      .mockReturnValueOnce(secondTransaction.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        first: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        second: useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
        indexingStatus: useEntityResponseIndexingState({
          entityId: 'claim-1',
          spaceId: TARGET_SPACE_ID,
          responseKind: 'stance',
        }),
      }),
      { wrapper }
    );

    act(() => result.current.first.submitResponse('positive'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.waitForIndexedEntityResponse).toHaveBeenCalledOnce();

    act(() => result.current.second.submitResponse('negative'));
    await act(async () => Promise.resolve());
    await act(async () => {
      secondTransaction.resolve({ _tag: 'Left', left: new Error('second rejected') });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.waitForIndexedEntityResponse).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstReconciliation.resolve(false);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.indexingStatus).toBe('reconciling');

    await act(async () => {
      restartedReconciliation.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.indexingStatus).toBe('idle');
    consoleError.mockRestore();
  });
});

describe('useEntityResponse claim-space membership', () => {
  it.each(['stance', 'veracity'] as const)(
    'requests membership of the claim space after a %s response lands',
    async responseKind => {
      mocks.fetchResponse.mockReturnValue('positive');
      const { wrapper } = createHarness();
      const { result } = renderHook(
        () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind }),
        { wrapper }
      );

      act(() => result.current.submitResponse('positive'));
      await act(async () => Promise.resolve());

      expect(mocks.ensureSpaceMembership).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: TARGET_SPACE_ID, personalSpaceId: PERSONAL_SPACE_ID })
      );
    }
  );

  it('requests membership for a negative claim response too', async () => {
    mocks.fetchResponse.mockReturnValue('negative');
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'veracity' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('negative'));
    await act(async () => Promise.resolve());

    expect(mocks.ensureSpaceMembership).toHaveBeenCalledOnce();
  });

  it('does not request membership for curation votes', async () => {
    mocks.fetchResponse.mockReturnValue('positive');
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'entity-1', spaceId: TARGET_SPACE_ID, responseKind: 'curation' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => Promise.resolve());

    expect(mocks.ensureSpaceMembership).not.toHaveBeenCalled();
  });

  it('does not request membership when a response is withdrawn', async () => {
    mocks.fetchResponse.mockReturnValue(null);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('clear'));
    await act(async () => Promise.resolve());

    expect(mocks.ensureSpaceMembership).not.toHaveBeenCalled();
  });

  it('does not request membership when the response transaction fails', async () => {
    mocks.runEffectEither.mockResolvedValue({ _tag: 'Left', left: new Error('rejected') });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useEntityResponse({ entityId: 'claim-1', spaceId: TARGET_SPACE_ID, responseKind: 'stance' }),
      { wrapper }
    );

    act(() => result.current.submitResponse('positive'));
    await act(async () => Promise.resolve());

    expect(mocks.ensureSpaceMembership).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

/**
 * GEO-2687. This re-check is on the critical path of a two-person interaction: in the rematch
 * picker the opponent only learns about a position once this client notices it is indexed and
 * tells geo-chat, which then emits `debate.claims_changed`. It used to be a flat 10s, which
 * quantised the opponent's view to 10s steps on top of a write measuring p50 9.9s / p95 48.6s.
 */
describe('responseIndexingRetryDelayMs', () => {
  it('starts fast, so indexing that lands a second later is not charged a full interval', () => {
    expect(responseIndexingRetryDelayMs(0)).toBe(1_000);
  });

  it('backs off, so a genuinely slow index does not become a tight poll', () => {
    expect(responseIndexingRetryDelayMs(1)).toBe(2_000);
    expect(responseIndexingRetryDelayMs(2)).toBe(4_000);
    expect(responseIndexingRetryDelayMs(3)).toBe(8_000);
  });

  it('caps at the old flat interval, so it is never slower than what it replaced', () => {
    expect(responseIndexingRetryDelayMs(4)).toBe(10_000);
    expect(responseIndexingRetryDelayMs(50)).toBe(10_000);
    // 2 ** 50 * 1000 overflows into a number far above the cap; the clamp has to hold there too.
    expect(Number.isFinite(responseIndexingRetryDelayMs(2000))).toBe(true);
    expect(responseIndexingRetryDelayMs(2000)).toBe(10_000);
  });

  it('is monotonic and never below the base', () => {
    let previous = 0;
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      const delay = responseIndexingRetryDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(Math.max(previous, 1_000));
      previous = delay;
    }
  });

  it('treats a negative attempt as the first one rather than returning a sub-base delay', () => {
    expect(responseIndexingRetryDelayMs(-1)).toBe(1_000);
  });
});
