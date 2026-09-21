import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type * as React from 'react';
import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';
import { PEER_SCHEDULE_DAYS } from '~/core/availability/peer-schedule';

import type { ScheduleOverlapResponse } from './api';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getIdentityToken: vi.fn(),
  identityToken: vi.fn(),
  getScheduleOverlaps: vi.fn(),
  getDebateSchedule: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  useIdentityToken: () => ({ identityToken: mocks.identityToken() }),
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGateway: () => ({ status: 'ready', paused: false }),
  useDebateGatewayScope: vi.fn(),
  useDebateGatewaySnapshot: () => ({ status: 'ready', paused: false }),
  useDebateGatewaySpaceScopes: vi.fn(),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  getScheduleOverlaps: mocks.getScheduleOverlaps,
  getDebateSchedule: mocks.getDebateSchedule,
}));

const { usePeerSchedule } = await import('./hooks');

const overlap = (overrides: Partial<ScheduleOverlapResponse> = {}): ScheduleOverlapResponse => ({
  with: 'user-peer',
  both_have_schedules: true,
  viewer_timezone: 'America/New_York',
  with_timezone: 'Europe/Berlin',
  slots: [],
  truncated: false,
  ...overrides,
});

/** Resolved by hand, so the two reads can be interleaved. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

/** One client per test, held so a case can drive a refetch the way the app would. */
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

let client: QueryClient;
let wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;

beforeEach(() => {
  // A fresh client per test, so one case's cache cannot answer the next one's query.
  ({ client, wrapper } = harness());
  mocks.authenticated = true;
  mocks.identityToken.mockReturnValue('token');
  mocks.getIdentityToken.mockResolvedValue('token');
  setCachedIdentityToken('token');
  mocks.getScheduleOverlaps.mockReset();
  mocks.getDebateSchedule.mockReset();
});

describe('usePeerSchedule', () => {
  it('builds the view model once both reads land', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap());
    mocks.getDebateSchedule.mockResolvedValue({ is_set: true, schedule: { recurring: [], dated: [] } });

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    await waitFor(() => expect(result.current.schedule).toBeDefined());
    expect(result.current.isError).toBe(false);
    expect(result.current.schedule?.viewerHasSchedule).toBe(true);
  });

  // The viewer read usually fails first, and a later `both_have_schedules: true` makes it moot.
  it('keeps waiting when the viewer read fails while the overlap is still in flight', async () => {
    const pending = deferred<ScheduleOverlapResponse>();
    mocks.getScheduleOverlaps.mockReturnValue(pending.promise);
    mocks.getDebateSchedule.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    // Let the viewer read reject and settle before asserting on the pair.
    await waitFor(() => expect(mocks.getDebateSchedule).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(result.current.isError).toBe(false);

    pending.settle(overlap({ both_have_schedules: true }));

    await waitFor(() => expect(result.current.schedule).toBeDefined());
    // Never flashed an error on the way.
    expect(result.current.isError).toBe(false);
    expect(result.current.schedule?.viewerHasSchedule).toBe(true);
  });

  // With `both_have_schedules: false` the viewer's own read is the only thing that can say which
  // side is missing a schedule, so losing it is genuinely fatal rather than merely early.
  it('reports an error once the overlap needs the viewer read and it failed', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap({ both_have_schedules: false }));
    mocks.getDebateSchedule.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.schedule).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  // Both can be true at once, and a stuck spinner is the worse of the two to render.
  it('reports an error rather than a spinner when both reads fail', async () => {
    mocks.getScheduleOverlaps.mockRejectedValue(new Error('down'));
    mocks.getDebateSchedule.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending).toBe(false);
  });

  // `useDebateSchedule` refetches on window focus. A failed background refetch flips its status to
  // error while the cached schedule is untouched, and that cached value is all this needs.
  it('keeps the week when a later viewer-schedule refetch fails', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap({ both_have_schedules: false }));
    mocks.getDebateSchedule.mockResolvedValue({ is_set: false, schedule: { recurring: [], dated: [] } });

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });
    await waitFor(() => expect(result.current.schedule).toBeDefined());

    mocks.getDebateSchedule.mockRejectedValue(new Error('blip'));
    await act(async () => {
      await client.refetchQueries();
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.schedule).toBeDefined();
  });

  // Nothing asserted this before, so the peer id and the window could both be wrong and green.
  it('asks for the peer it was given, over the window the grid draws', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap());
    mocks.getDebateSchedule.mockResolvedValue({ is_set: true, schedule: { recurring: [], dated: [] } });

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });
    await waitFor(() => expect(result.current.schedule).toBeDefined());

    expect(mocks.getScheduleOverlaps).toHaveBeenCalledWith(
      'user-peer',
      { days: PEER_SCHEDULE_DAYS },
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('keys the cache on the peer, so two peers cannot share an answer', async () => {
    mocks.getDebateSchedule.mockResolvedValue({ is_set: true, schedule: { recurring: [], dated: [] } });
    mocks.getScheduleOverlaps.mockImplementation((withUserId: string) =>
      Promise.resolve(overlap({ with: withUserId }))
    );

    const first = renderHook(() => usePeerSchedule('user-a-peer'), { wrapper });
    await waitFor(() => expect(first.result.current.schedule?.userId).toBe('user-a-peer'));

    const second = renderHook(() => usePeerSchedule('user-b-peer'), { wrapper });
    await waitFor(() => expect(second.result.current.schedule?.userId).toBe('user-b-peer'));

    expect(mocks.getScheduleOverlaps).toHaveBeenCalledTimes(2);
  });

  it('asks nothing signed out, and does not sit at pending forever', () => {
    mocks.authenticated = false;

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(mocks.getScheduleOverlaps).not.toHaveBeenCalled();
  });

  it('asks nothing without a peer', () => {
    const { result } = renderHook(() => usePeerSchedule(null), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(mocks.getScheduleOverlaps).not.toHaveBeenCalled();
  });
});
