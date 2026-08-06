import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityResponse } from './use-entity-vote';

const PERSONAL_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const TARGET_SPACE_ID = '1234567890abcdef1234567890abcdef';

const mocks = vi.hoisted(() => ({
  fetchResponse: vi.fn<() => 'positive' | 'negative' | null>(),
  runEffectEither: vi.fn(),
  responseAction: vi.fn(() => ({ to: '0x1234' as const, calldata: '0xabcd' as const })),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL_SPACE_ID, isRegistered: true }),
}));

vi.mock('~/core/hooks/use-smart-account-transaction', async () => {
  const { Effect } = await import('effect');
  return { useSmartAccountTransaction: () => () => Effect.succeed('0xtransaction') };
});

vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return { getUserEntityResponse: () => Effect.sync(() => mocks.fetchResponse()) };
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
});

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
