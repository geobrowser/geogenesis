import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityResponse, useEntityResponseIndexingState } from './use-entity-vote';

const PERSONAL_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const TARGET_SPACE_ID = '1234567890abcdef1234567890abcdef';

const mocks = vi.hoisted(() => ({
  fetchResponse:
    vi.fn<(signal?: AbortSignal) => 'positive' | 'negative' | null | Promise<'positive' | 'negative' | null>>(),
  runEffectEither: vi.fn(),
  responseAction: vi.fn(() => ({ to: '0x1234' as const, calldata: '0xabcd' as const })),
  waitForIndexedEntityResponse: vi.fn(),
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

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL_SPACE_ID, isRegistered: true }),
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

vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: (...args: unknown[]) => mocks.runEffectEither(...args),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchResponse.mockReset();
  mocks.runEffectEither.mockReset();
  mocks.responseAction.mockClear();
  mocks.waitForIndexedEntityResponse.mockClear();
  mocks.runEffectEither.mockResolvedValue({ _tag: 'Right', right: '0xtransaction' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useEntityResponse indexing reconciliation', () => {
  it('keeps a submitted response unsettled and exposes retry after reconciliation exhausts', async () => {
    mocks.fetchResponse.mockReturnValue(null);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
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

    await act(async () => vi.advanceTimersByTimeAsync(58_000));

    expect(mocks.fetchResponse).toHaveBeenCalledTimes(30);
    expect(result.current.isProcessingResponse).toBe(true);
    expect(result.current.isResponseIndexingDelayed).toBe(true);
    expect(result.current.retryResponseIndexing).toEqual(expect.any(Function));
    expect(invalidateQueries).not.toHaveBeenCalled();

    mocks.fetchResponse.mockReturnValue('positive');
    await act(async () => {
      result.current.retryResponseIndexing();
      await Promise.resolve();
    });

    expect(result.current.isProcessingResponse).toBe(false);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
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
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(2_000));

    expect(mocks.fetchResponse).toHaveBeenCalledTimes(2);
    expect(result.current.isProcessingResponse).toBe(false);
    expect(result.current.isResponseIndexingDelayed).toBe(false);
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
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

    await act(async () => {
      secondTransaction.resolve({ _tag: 'Right', right: '0xsecond' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.fetchResponse).toHaveBeenCalledOnce();
    expect(result.current.indexingStatus).toBe('reconciling');

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
