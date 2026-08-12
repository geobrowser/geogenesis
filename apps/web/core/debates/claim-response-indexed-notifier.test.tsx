import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaimResponseIndexedNotifier } from './claim-response-indexed-notifier';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('./api', () => ({
  notifyClaimResponseIndexed: (...args: unknown[]) => mocks.notify(...args),
}));

describe('useClaimResponseIndexedNotifier', () => {
  beforeEach(() => {
    mocks.notify.mockReset();
    mocks.notify.mockResolvedValue(undefined);
  });

  it('notifies geo-chat once when a claim response indexing run is confirmed', async () => {
    const { queryClient, wrapper } = createHarness();
    const getPrivyIdentityToken = vi.fn();
    renderHook(() => useClaimResponseIndexedNotifier(true, getPrivyIdentityToken, 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'veracity'] as const;
    const indexed = {
      status: 'indexed',
      pending: {
        entityId: 'claim-1',
        expectedResponse: 'negative',
        personalSpaceId: 'profile-1',
        responseKind: 'veracity',
        spaceId: 'space-1',
      },
      runId: 'run-1',
    } as const;

    act(() => queryClient.setQueryData(queryKey, indexed));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        'space-1',
        'claim-1',
        'veracity',
        false,
        getPrivyIdentityToken,
        'account-1',
        expect.any(AbortSignal)
      )
    );

    act(() => queryClient.setQueryData(queryKey, indexed));
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it('reports cleared responses and ignores curation indexing', async () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });

    act(() => {
      queryClient.setQueryData(['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'], {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: null,
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-clear',
      });
      queryClient.setQueryData(['entity-response-indexing', 'profile-1', 'entity-1', 'space-1', 'curation'], {
        status: 'indexed',
        pending: {
          entityId: 'entity-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'curation',
          spaceId: 'space-1',
        },
        runId: 'run-curation',
      });
    });

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    expect(mocks.notify).toHaveBeenCalledWith(
      'space-1',
      'claim-1',
      'stance',
      null,
      expect.any(Function),
      'account-1',
      expect.any(AbortSignal)
    );
  });

  it('falls back to a silent local claim refresh when notification fails', async () => {
    mocks.notify.mockRejectedValue(new Error('geo-chat unavailable'));
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });

    act(() => {
      queryClient.setQueryData(['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'], {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-failure',
      });
    });

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['debates', 'claims', 'space-1'] }));
  });

  it('retries an interrupted notification when the same account is re-enabled', async () => {
    let notificationSignal: AbortSignal | undefined;
    mocks.notify.mockImplementation((...args: unknown[]) => {
      notificationSignal = args.at(-1) as AbortSignal;
      return new Promise((_, reject) => {
        notificationSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted', 'AbortError')),
          { once: true }
        );
      });
    });
    const { queryClient, wrapper } = createHarness();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const getPrivyIdentityToken = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useClaimResponseIndexedNotifier(enabled, getPrivyIdentityToken, 'account-1'),
      {
        initialProps: { enabled: true },
        wrapper,
      }
    );

    act(() => {
      queryClient.setQueryData(['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'], {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-cancelled',
      });
    });

    await waitFor(() => expect(notificationSignal).toBeDefined());
    rerender({ enabled: false });
    await waitFor(() => expect(notificationSignal?.aborted).toBe(true));
    expect(invalidateQueries).not.toHaveBeenCalled();

    mocks.notify.mockResolvedValue(undefined);
    rerender({ enabled: true });
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('does not replay an interrupted notification for another account', async () => {
    let notificationSignal: AbortSignal | undefined;
    mocks.notify.mockImplementation((...args: unknown[]) => {
      notificationSignal = args.at(-1) as AbortSignal;
      return new Promise((_, reject) => {
        notificationSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted', 'AbortError')),
          { once: true }
        );
      });
    });
    const { queryClient, wrapper } = createHarness();
    const { rerender } = renderHook(({ accountKey }) => useClaimResponseIndexedNotifier(true, vi.fn(), accountKey), {
      initialProps: { accountKey: 'account-1' },
      wrapper,
    });

    act(() => {
      queryClient.setQueryData(['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'], {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-account-change',
      });
    });

    await waitFor(() => expect(notificationSignal).toBeDefined());
    rerender({ accountKey: 'account-2' });
    await waitFor(() => expect(notificationSignal?.aborted).toBe(true));
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
});

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}
