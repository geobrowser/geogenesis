import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

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
  their_slots: [],
  viewer_has_schedule: true,
  truncated: false,
  ...overrides,
});

/** A fresh client per test, so one case's cache cannot answer the next one's query. */
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

let wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;

beforeEach(() => {
  wrapper = harness();
  mocks.authenticated = true;
  mocks.identityToken.mockReturnValue('token');
  mocks.getIdentityToken.mockResolvedValue('token');
  setCachedIdentityToken('token');
  mocks.getScheduleOverlaps.mockReset();
  mocks.getDebateSchedule.mockReset();
});

describe('usePeerSchedule', () => {
  it('builds the view model from the one response', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap({ viewer_has_schedule: true }));

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    await waitFor(() => expect(result.current.schedule).toBeDefined());
    expect(result.current.isError).toBe(false);
    expect(result.current.schedule?.viewerHasSchedule).toBe(true);
    // One request: the viewer's own schedule rides along on the response.
    expect(mocks.getDebateSchedule).not.toHaveBeenCalled();
  });

  it('reports an error rather than a spinner when the read fails', async () => {
    mocks.getScheduleOverlaps.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => usePeerSchedule('user-peer'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending).toBe(false);
  });

  // Nothing asserted this before, so the peer id and the window could both be wrong and green.
  it('asks for the peer it was given, over the window the grid draws', async () => {
    mocks.getScheduleOverlaps.mockResolvedValue(overlap());

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

  // A caller that keeps a closed dialog mounted passes an empty id rather than null.
  it('asks nothing for an empty peer id', () => {
    const { result } = renderHook(() => usePeerSchedule(''), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(mocks.getScheduleOverlaps).not.toHaveBeenCalled();
  });

  // Including the viewer's own schedule: with no peer there is nothing to interpret it against.
  it('asks nothing without a peer', () => {
    const { result } = renderHook(() => usePeerSchedule(null), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(mocks.getScheduleOverlaps).not.toHaveBeenCalled();
    expect(mocks.getDebateSchedule).not.toHaveBeenCalled();
  });
});
