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

  // GEO-2603. This notification is what puts the response in geo-chat's copy, and the rematch
  // picker gates Request debate on geo-chat agreeing the viewer has taken a side. The picker's own
  // refresh runs off the same `indexed` event that starts the notification, so it races it and
  // usually loses; the ask that follows the notification is the only one guaranteed to postdate it.
  it('asks the rematch picker again once geo-chat has been told', async () => {
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
        runId: 'run-refresh',
      });
    });

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    const refresh = await waitFor(() => {
      const call = invalidateQueries.mock.calls.find(([filters]) => typeof filters?.predicate === 'function');
      const predicate = call?.[0]?.predicate;
      expect(predicate).toBeTypeOf('function');
      return predicate!;
    });

    const batch = (claimIds: string[]) => ({
      queryKey: ['debates', 'account', 'account-1', 'rematch', 'rematch-1', 'claims', claimIds],
    });
    // The batches that name the claim, plus the session's own id-less list — and nothing else.
    expect(refresh(batch(['claim-1']) as never)).toBe(true);
    expect(refresh(batch([]) as never)).toBe(true);
    expect(refresh(batch(['claim-2']) as never)).toBe(false);
    expect(refresh({ queryKey: ['debates', 'claims', 'space-1'] } as never)).toBe(false);
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
    // Neither the fallback nor the picker refresh belongs to a notification this hook cancelled
    // itself: geo-chat was never told, so nothing it could answer with has changed, and the retry
    // below is what will ask once it has been.
    expect(invalidateQueries).not.toHaveBeenCalled();

    mocks.notify.mockResolvedValue(undefined);
    rerender({ enabled: true });
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    // The retry landed, so the picker is asked again — but the failure fallback still must not fire.
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['debates', 'claims', 'space-1'] });
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
