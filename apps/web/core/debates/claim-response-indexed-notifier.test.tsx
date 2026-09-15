import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import { useClaimResponseIndexedNotifier } from './claim-response-indexed-notifier';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  notifyClaimResponseIndexed: (...args: unknown[]) => mocks.notify(...args),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-1' }),
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

  // GEO-2784. The whole point of the change: geo-chat is told while the write is in flight, so the
  // opposite side's "Request debate" appears at once instead of ~10s later (p50 9.9s for
  // web.write.entity_response). Before this, the notification waited for `status: 'indexed'` and
  // geo-chat 409'd anything unconfirmed.
  it('notifies geo-chat while the write is still in flight, before it is indexed', async () => {
    const { queryClient, wrapper } = createHarness();
    const getPrivyIdentityToken = vi.fn();
    renderHook(() => useClaimResponseIndexedNotifier(true, getPrivyIdentityToken, 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;

    act(() =>
      queryClient.setQueryData(queryKey, {
        status: 'pending',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-1',
      })
    );

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        'space-1',
        'claim-1',
        'stance',
        true,
        getPrivyIdentityToken,
        'account-1',
        expect.any(AbortSignal)
      )
    );
  });

  // The in-flight report is not a replacement for the confirmed one — that second call is the
  // reconciliation, and geo-chat converges on it if the write never landed. Keyed separately so
  // the dedupe does not swallow it.
  it('still notifies again once the same response is indexed', async () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = {
      entityId: 'claim-1',
      expectedResponse: 'positive',
      personalSpaceId: 'profile-1',
      responseKind: 'stance',
      spaceId: 'space-1',
    } as const;

    act(() => queryClient.setQueryData(queryKey, { status: 'pending', pending, runId: 'run-1' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());

    act(() => queryClient.setQueryData(queryKey, { status: 'indexed', pending, runId: 'run-1' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
  });

  // Every submission is reported, even one repeating a side reported earlier for the same claim.
  it('reports each submission in flight, including a side already reported this session', async () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = (expectedResponse: 'positive' | 'negative') => ({
      entityId: 'claim-1',
      expectedResponse,
      personalSpaceId: 'profile-1',
      responseKind: 'stance',
      spaceId: 'space-1',
    });

    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('positive'), runId: 'run-1' })
    );
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('negative'), runId: 'run-2' })
    );
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('positive'), runId: 'run-3' })
    );
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(3));
    expect(mocks.notify.mock.calls[2]?.[3]).toBe(true);

    // The same submission cycling through its states is still one report.
    act(() => queryClient.setQueryData(queryKey, { status: 'delayed', pending: pending('positive'), runId: 'run-3' }));
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledTimes(3);
  });

  // One request per claim at a time, so geo-chat cannot apply an older switch after a newer one.
  it('sends a claim’s reports one at a time and ends on the newest', async () => {
    const releases: Array<() => void> = [];
    mocks.notify.mockImplementation(() => new Promise<void>(resolve => releases.push(resolve)));
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = (expectedResponse: 'positive' | 'negative') => ({
      entityId: 'claim-1',
      expectedResponse,
      personalSpaceId: 'profile-1',
      responseKind: 'stance',
      spaceId: 'space-1',
    });

    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('positive'), runId: 'run-1' })
    );
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('negative'), runId: 'run-2' })
    );
    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('positive'), runId: 'run-3' })
    );
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledTimes(1);

    await act(async () => releases[0]?.());
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    expect(mocks.notify.mock.calls[1]?.[3]).toBe(true);

    await act(async () => releases[1]?.());
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it('waits out Retry-After and sends a rate-limited report again', async () => {
    mocks.notify
      .mockRejectedValueOnce(new GeoChatRequestError('rate limited', 'rate_limited', 429, 20))
      .mockResolvedValue(undefined);
    const { queryClient, wrapper } = createHarness();
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
        runId: 'run-rate-limited',
      });
    });

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    expect(mocks.notify.mock.calls[1]?.slice(0, 4)).toEqual(['space-1', 'claim-1', 'stance', true]);
  });

  // When a newer write fails, `useEntityResponse` restores the earlier run, and geo-chat was last told
  // the failed run's side.
  it('reports a restored run that was replaced while it waited', async () => {
    const releases: Array<() => void> = [];
    mocks.notify.mockImplementation(() => new Promise<void>(resolve => releases.push(resolve)));
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const state = (status: 'reconciling' | 'indexed', expectedResponse: 'positive' | 'negative', runId: string) => ({
      status,
      pending: {
        entityId: 'claim-1',
        expectedResponse,
        personalSpaceId: 'profile-1',
        responseKind: 'stance',
        spaceId: 'space-1',
      },
      runId,
    });

    act(() => queryClient.setQueryData(queryKey, state('reconciling', 'positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() => queryClient.setQueryData(queryKey, state('indexed', 'positive', 'run-1')));
    act(() => queryClient.setQueryData(queryKey, state('reconciling', 'negative', 'run-2')));

    await act(async () => releases[0]?.());
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    expect(mocks.notify.mock.calls[1]?.[3]).toBe(false);
    await act(async () => releases[1]?.());

    // run-2's write fails and run-1's indexed state is restored.
    act(() => queryClient.setQueryData(queryKey, state('indexed', 'positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(3));
    expect(mocks.notify.mock.calls[2]?.[3]).toBe(true);
  });

  it('reports a restored run again after a newer run reached geo-chat', async () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const state = (status: 'reconciling' | 'indexed', expectedResponse: 'positive' | 'negative', runId: string) => ({
      status,
      pending: {
        entityId: 'claim-1',
        expectedResponse,
        personalSpaceId: 'profile-1',
        responseKind: 'stance',
        spaceId: 'space-1',
      },
      runId,
    });

    act(() => queryClient.setQueryData(queryKey, state('indexed', 'positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() => queryClient.setQueryData(queryKey, state('reconciling', 'negative', 'run-2')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));

    act(() => queryClient.setQueryData(queryKey, state('indexed', 'positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(3));
    expect(mocks.notify.mock.calls[2]?.[3]).toBe(true);
  });

  it('ignores an indexing event written by another personal space', async () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });

    act(() => {
      queryClient.setQueryData(['entity-response-indexing', 'profile-2', 'claim-1', 'space-1', 'stance'], {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-2',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-other-account',
      });
    });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('gives each report its own Retry-After budget', async () => {
    const rateLimited = () => new GeoChatRequestError('rate limited', 'rate_limited', 429, 10);
    let rejectFirst: ((error: unknown) => void) | undefined;
    mocks.notify
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          })
      )
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue(undefined);
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useClaimResponseIndexedNotifier(true, vi.fn(), 'account-1'), { wrapper });
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = (expectedResponse: 'positive' | 'negative', runId: string) => ({
      status: 'reconciling',
      pending: {
        entityId: 'claim-1',
        expectedResponse,
        personalSpaceId: 'profile-1',
        responseKind: 'stance',
        spaceId: 'space-1',
      },
      runId,
    });

    act(() => queryClient.setQueryData(queryKey, pending('positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() => queryClient.setQueryData(queryKey, pending('negative', 'run-2')));

    // run-1's 429 hands the lane to run-2, which must still get all three retries of its own.
    await act(async () => rejectFirst?.(rateLimited()));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(5));
    expect(mocks.notify.mock.calls.slice(1).every(call => call[3] === false)).toBe(true);
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

  // GEO-2814. Every Request debate control reads geo-chat's copy of the position from one of three
  // independently-keyed queries. Only the rematch picker was refreshed after the notification, so
  // the rest converged whenever they happened to refetch next — Explore asks per card behind
  // `nearViewport` and so refetched constantly, the hub asks once per tab and sat stale. That gap
  // is the inconsistency, not the gate, which all of them already share.
  it('refreshes every readiness source once geo-chat has been told', async () => {
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
        runId: 'run-readiness',
      });
    });

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    for (const queryKey of [
      ['debates', 'claims', 'space-1'],
      ['debates', 'account', 'account-1', 'matchmaking-claims'],
      ['debates', 'account', 'account-1', 'matches'],
    ]) {
      await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey }));
    }
  });

  it('refreshes the readiness sources even when the notification fails', async () => {
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

  it('keeps a sent report running through a disable and queues newer reports behind it', async () => {
    const releases: Array<() => void> = [];
    const signals: AbortSignal[] = [];
    mocks.notify.mockImplementation((...args: unknown[]) => {
      signals.push(args.at(-1) as AbortSignal);
      return new Promise<void>(resolve => releases.push(resolve));
    });
    const { queryClient, wrapper } = createHarness();
    const getPrivyIdentityToken = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useClaimResponseIndexedNotifier(enabled, getPrivyIdentityToken, 'account-1'),
      { initialProps: { enabled: true }, wrapper }
    );
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = (expectedResponse: 'positive' | 'negative') => ({
      entityId: 'claim-1',
      expectedResponse,
      personalSpaceId: 'profile-1',
      responseKind: 'stance',
      spaceId: 'space-1',
    });

    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('positive'), runId: 'run-1' })
    );
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    expect(signals[0]?.aborted).toBe(false);
    rerender({ enabled: true });

    act(() =>
      queryClient.setQueryData(queryKey, { status: 'reconciling', pending: pending('negative'), runId: 'run-2' })
    );
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledTimes(1);

    await act(async () => releases[0]?.());
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(2));
    expect(mocks.notify.mock.calls[1]?.[3]).toBe(false);
  });

  it('never sends a queued report under another account', async () => {
    const signals: AbortSignal[] = [];
    mocks.notify.mockImplementation((...args: unknown[]) => {
      signals.push(args.at(-1) as AbortSignal);
      return new Promise<void>(() => {});
    });
    const { queryClient, wrapper } = createHarness();
    const getPrivyIdentityToken = vi.fn();
    const { rerender } = renderHook(
      ({ accountKey }) => useClaimResponseIndexedNotifier(true, getPrivyIdentityToken, accountKey),
      { initialProps: { accountKey: 'account-1' as string | null }, wrapper }
    );
    const queryKey = ['entity-response-indexing', 'profile-1', 'claim-1', 'space-1', 'stance'] as const;
    const pending = (expectedResponse: 'positive' | 'negative', runId: string) => ({
      status: 'reconciling',
      pending: {
        entityId: 'claim-1',
        expectedResponse,
        personalSpaceId: 'profile-1',
        responseKind: 'stance',
        spaceId: 'space-1',
      },
      runId,
    });

    act(() => queryClient.setQueryData(queryKey, pending('positive', 'run-1')));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
    act(() => queryClient.setQueryData(queryKey, pending('negative', 'run-2')));

    // The request in flight is cancelled before it can pick up the new account's session, and the
    // report queued behind it is dropped rather than held for the old account's return.
    rerender({ accountKey: 'account-2' });
    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
    rerender({ accountKey: 'account-1' });
    await Promise.resolve();
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it('cancels a report in flight when the viewer signs out', async () => {
    const signals: AbortSignal[] = [];
    mocks.notify.mockImplementation((...args: unknown[]) => {
      signals.push(args.at(-1) as AbortSignal);
      return new Promise<void>(() => {});
    });
    const { queryClient, wrapper } = createHarness();
    const { rerender } = renderHook(
      ({ accountKey }) => useClaimResponseIndexedNotifier(Boolean(accountKey), vi.fn(), accountKey),
      { initialProps: { accountKey: 'account-1' as string | null }, wrapper }
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
        runId: 'run-sign-out',
      });
    });
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());

    rerender({ accountKey: null });
    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
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
