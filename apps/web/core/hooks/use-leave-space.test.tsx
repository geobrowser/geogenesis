import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '~/core/state/jotai-store';
import { requestedMembershipSpacesAtom } from '~/core/state/requested-membership';

import { useLeaveSpace } from './use-leave-space';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const MEMBER = 'b7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21';
const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  refresh: vi.fn(),
  tx: vi.fn(),
  getIsMemberOfSpace: vi.fn(),
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
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

    await act(() => result.current.leaveSpaceAsync());

    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.getIsMemberOfSpace).toHaveBeenCalledWith(SPACE, MEMBER, expect.any(AbortSignal));
    expect(store.get(requestedMembershipSpacesAtom)).toEqual([expect.objectContaining({ ownerId: 'another-owner' })]);
    for (const queryKey of [
      ['space', SPACE],
      ['space-participants', SPACE, 'members'],
      ['space-access-control', 'member', SPACE],
      ['space-roles', SPACE],
      ['spaces-where-member'],
      ['creatable-space-ids'],
      ['pending-memberships'],
      ['browse-sidebar-data'],
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('waits for delayed indexing before refreshing server-rendered membership', async () => {
    vi.useFakeTimers();
    mocks.getIsMemberOfSpace.mockReturnValueOnce(Effect.succeed(true)).mockReturnValue(Effect.succeed(false));
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

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

  it('does not report a mined leave as failed when indexing remains unavailable', async () => {
    vi.useFakeTimers();
    mocks.getIsMemberOfSpace.mockReturnValue(Effect.fail(new Error('Indexer unavailable')));
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

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
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

    await act(() => expect(result.current.leaveSpaceAsync()).rejects.toThrow('Transaction rejected'));

    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'ERROR', payload: String(error) });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(store.get(requestedMembershipSpacesAtom)).toEqual(pending);
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
    const first = renderHook(() => useLeaveSpace(SPACE), { wrapper });
    let leaving!: Promise<unknown>;
    act(() => {
      leaving = first.result.current.leaveSpaceAsync();
    });
    await waitFor(() => expect(mocks.tx).toHaveBeenCalledOnce());
    first.unmount();
    const reopened = renderHook(() => useLeaveSpace(SPACE), { wrapper });

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
    const { result, rerender } = renderHook(({ spaceId }) => useLeaveSpace(spaceId), {
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
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

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
    const { result } = renderHook(() => useLeaveSpace(SPACE), { wrapper });

    await act(() => expect(result.current.leaveSpaceAsync()).rejects.toThrow());

    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR' }));
  });
});
