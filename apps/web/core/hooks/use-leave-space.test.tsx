import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as spaceParticipantQueries from '~/core/space-members/use-space-participants-infinite';
import { store } from '~/core/state/jotai-store';
import { requestedMembershipSpacesAtom } from '~/core/state/requested-membership';

import { useLeaveSpace } from './use-leave-space';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const MEMBER = 'b7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21';
const MEMBERSHIP_QUERY_KEYS = [
  ['space', SPACE],
  ['space-participants', SPACE, 'members'],
  ['space-access-control', 'member', SPACE],
  ['space-roles', SPACE],
  ['spaces-where-member'],
  ['creatable-space-ids'],
  ['pending-memberships'],
  ['browse-sidebar-data'],
] as const;
const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  refresh: vi.fn(),
  tx: vi.fn(),
  getIsMemberOfSpace: vi.fn(),
  readSpaceMembership: vi.fn(),
  connected: true,
  registered: true,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('~/core/state/status-bar-store', () => ({ useStatusBar: () => ({ dispatch: mocks.dispatch }) }));
vi.mock('./use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.connected ? { account: { address: '0xviewer' } } : null }),
}));
vi.mock('./use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: MEMBER, isRegistered: mocks.registered }),
}));
vi.mock('./use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => mocks.tx }));
vi.mock('~/core/io/queries', () => ({ getIsMemberOfSpace: mocks.getIsMemberOfSpace }));
vi.mock('~/core/utils/contracts/read-space-membership', () => ({ readSpaceMembership: mocks.readSpaceMembership }));
vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.either(effect)),
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mocks.connected = true;
  mocks.registered = true;
  mocks.tx.mockReturnValue(Effect.succeed('0xreceipt'));
  mocks.getIsMemberOfSpace.mockReturnValue(Effect.succeed(false));
  mocks.readSpaceMembership.mockResolvedValue(true);
  store.set(requestedMembershipSpacesAtom, []);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

describe('useLeaveSpace', () => {
  it('submits the leave, clears only this membership request, and refreshes membership consumers', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    store.set(requestedMembershipSpacesAtom, [
      { id: SPACE, ownerId: MEMBER, requestedAt: Date.now() },
      { id: SPACE, ownerId: 'another-owner', requestedAt: Date.now() },
    ]);
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(() => result.current.leaveSpaceAsync());

    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.getIsMemberOfSpace).toHaveBeenCalledWith(SPACE, MEMBER, expect.any(AbortSignal));
    expect(store.get(requestedMembershipSpacesAtom)).toEqual([expect.objectContaining({ ownerId: 'another-owner' })]);
    for (const queryKey of MEMBERSHIP_QUERY_KEYS) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('follows the participant key factory and invalidates every member page size without touching editors or another space', async () => {
    // Exercise Patrick's concrete drift scenario: a key factory that canonicalizes
    // IDs. The caller must follow it instead of repeating today's literal key.
    const keyFactory = vi
      .spyOn(spaceParticipantQueries, 'spaceParticipantsQueryKey')
      .mockImplementation(
        (id, kind, pageSize = 50) => ['space-participants', id.replace(/-/g, '').toLowerCase(), kind, pageSize] as const
      );
    const rawSpaceId = '41E85161-0E13-A194-41C4-D980F2F2CE6B';
    const memberKeys = [10, 50].map(size =>
      spaceParticipantQueries.spaceParticipantsQueryKey(rawSpaceId, 'members', size)
    );
    const untouchedKeys = [
      spaceParticipantQueries.spaceParticipantsQueryKey(rawSpaceId, 'editors'),
      spaceParticipantQueries.spaceParticipantsQueryKey('11111111111111111111111111111111', 'members'),
    ];
    for (const key of [...memberKeys, ...untouchedKeys]) client.setQueryData(key, { pages: [], pageParams: [] });
    const { result } = renderHook(() => useLeaveSpace(rawSpaceId, true), { wrapper });

    try {
      await act(() => result.current.leaveSpaceAsync());

      for (const key of memberKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      for (const key of untouchedKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      keyFactory.mockRestore();
    }
  });

  it('waits for delayed indexing before refreshing server-rendered membership', async () => {
    vi.useFakeTimers();
    mocks.getIsMemberOfSpace.mockReturnValueOnce(Effect.succeed(true)).mockReturnValue(Effect.succeed(false));
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(async () => {
      const leaving = result.current.leaveSpaceAsync();
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.refresh).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      await leaving;
    });

    expect(mocks.getIsMemberOfSpace).toHaveBeenCalledTimes(2);
    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(MEMBERSHIP_QUERY_KEYS.flatMap(queryKey => [false, true].map(alreadyLeft => ({ queryKey, alreadyLeft }))))(
    'finishes despite a stalled $queryKey refetch (alreadyLeft: $alreadyLeft)',
    async ({ queryKey, alreadyLeft }) => {
      vi.useFakeTimers();
      mocks.readSpaceMembership.mockResolvedValue(!alreadyLeft);
      let release!: () => void;
      const stalledRefetch = new Promise<void>(resolve => {
        release = resolve;
      });
      const invalidate = vi
        .spyOn(client, 'invalidateQueries')
        .mockImplementation(filters =>
          JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey) ? stalledRefetch : Promise.resolve()
        );
      const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });
      let settled = false;
      let leaving!: Promise<unknown>;

      try {
        await act(async () => {
          leaving = result.current.leaveSpaceAsync().then(value => {
            settled = true;
            return value;
          });
          await vi.advanceTimersByTimeAsync(1);
        });

        // Prove completion before the stalled refetch is released, not merely after
        // a test timeout or after every invalidation happens to have resolved.
        expect(settled).toBe(true);
        expect(result.current.status).toBe('success');
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(mocks.tx).toHaveBeenCalledTimes(alreadyLeft ? 0 : 1);
        for (const key of MEMBERSHIP_QUERY_KEYS) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
        expect(mocks.dispatch).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          release();
          await leaving;
        });
      }
    }
  );

  it('does not report a mined leave as failed when indexing remains unavailable', async () => {
    vi.useFakeTimers();
    mocks.getIsMemberOfSpace.mockReturnValue(Effect.fail(new Error('Indexer unavailable')));
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(async () => {
      const leaving = result.current.leaveSpaceAsync();
      await vi.advanceTimersByTimeAsync(10_000);
      await leaving;
    });

    expect(mocks.getIsMemberOfSpace).toHaveBeenCalledTimes(10);
    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('reports transaction failures without changing membership or refreshing', async () => {
    const error = new Error('Transaction rejected');
    mocks.tx.mockReturnValue(Effect.fail(error));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const pending = [{ id: SPACE, ownerId: MEMBER, requestedAt: Date.now() }];
    store.set(requestedMembershipSpacesAtom, pending);
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(() => expect(result.current.leaveSpaceAsync()).rejects.toThrow('Transaction rejected'));

    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'ERROR', payload: String(error) });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(store.get(requestedMembershipSpacesAtom)).toEqual(pending);
  });

  it('does not submit again after a confirmed leave even when the index is still behind on reopen', async () => {
    vi.useFakeTimers();
    mocks.getIsMemberOfSpace.mockReturnValue(Effect.succeed(true));
    const first = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });
    await act(async () => {
      const leaving = first.result.current.leaveSpaceAsync();
      await vi.advanceTimersByTimeAsync(10_000);
      await leaving;
    });
    first.unmount();
    mocks.readSpaceMembership.mockResolvedValue(false);
    const reopened = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(async () => {
      const leaving = reopened.result.current.leaveSpaceAsync();
      await vi.advanceTimersByTimeAsync(10_000);
      await leaving;
    });

    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('reports an unreadable on-chain membership before submitting a transaction', async () => {
    mocks.readSpaceMembership.mockRejectedValue(new Error('RPC unavailable'));
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(() => expect(result.current.leaveSpaceAsync()).rejects.toThrow('RPC unavailable'));

    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR' }));
  });

  it('clears the completed leave state when membership ends so a rejoined member can leave again', async () => {
    const { result, rerender } = renderHook(({ isMember }) => useLeaveSpace(SPACE, isMember), {
      wrapper,
      initialProps: { isMember: true },
    });
    await act(() => result.current.leaveSpaceAsync());
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ isMember: false });
    await waitFor(() => expect(result.current.status).toBe('idle'));
    rerender({ isMember: true });
    expect(result.current.status).toBe('idle');
    await act(() => result.current.leaveSpaceAsync());
    expect(mocks.tx).toHaveBeenCalledTimes(2);
  });

  it('shares pending state and prevents resubmission after the popover remounts', async () => {
    let confirm!: (hash: string) => void;
    mocks.tx.mockReturnValue(
      Effect.promise(
        () =>
          new Promise<string>(resolve => {
            confirm = resolve;
          })
      )
    );
    const first = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });
    let leaving!: Promise<unknown>;
    act(() => {
      leaving = first.result.current.leaveSpaceAsync();
    });
    await waitFor(() => expect(mocks.tx).toHaveBeenCalledOnce());
    first.unmount();
    const reopened = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await waitFor(() => expect(reopened.result.current.status).toBe('pending'));
    await act(() => reopened.result.current.leaveSpaceAsync());
    expect(mocks.tx).toHaveBeenCalledOnce();

    await act(async () => {
      confirm('0xreceipt');
      await leaving;
    });
  });

  it('invalidates the space that was left even if the hook navigates to a different space mid-transaction', async () => {
    let confirm!: (hash: string) => void;
    mocks.tx.mockReturnValue(
      Effect.promise(
        () =>
          new Promise<string>(resolve => {
            confirm = resolve;
          })
      )
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result, rerender } = renderHook(({ spaceId }) => useLeaveSpace(spaceId, true), {
      wrapper,
      initialProps: { spaceId: SPACE },
    });
    let leaving!: Promise<unknown>;
    act(() => {
      leaving = result.current.leaveSpaceAsync();
    });
    await waitFor(() => expect(mocks.tx).toHaveBeenCalledOnce());
    const otherSpace = '11111111111111111111111111111111';
    rerender({ spaceId: otherSpace });

    await act(async () => {
      confirm('0xreceipt');
      await leaving;
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['space', SPACE] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['space', otherSpace] });
  });

  it('still refreshes a mined leave when local storage and a query invalidation fail', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(client, 'invalidateQueries').mockRejectedValueOnce(new Error('Refresh failed'));
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    try {
      await act(() => expect(result.current.leaveSpaceAsync()).resolves.toBeDefined());
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(mocks.refresh).toHaveBeenCalledOnce();
    } finally {
      storage.mockRestore();
      warning.mockRestore();
    }
  });

  it.each(['connected', 'registered'] as const)('requires %s identity before sending', async field => {
    mocks[field] = false;
    const { result } = renderHook(() => useLeaveSpace(SPACE, true), { wrapper });

    await act(() => expect(result.current.leaveSpaceAsync()).rejects.toThrow());

    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR' }));
  });
});
