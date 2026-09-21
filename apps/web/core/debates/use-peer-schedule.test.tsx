import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
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
