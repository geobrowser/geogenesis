import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

import { GeoChatRequestError } from './api';
import {
  useCalendarBusy,
  useCalendarConnections,
  useDisconnectGoogleCalendar,
  useRefreshGoogleCalendar,
} from './calendar-hooks';
import { debateQueryKeys } from './hooks';

const mocks = vi.hoisted(() => ({
  getCalendarConnections: vi.fn(),
  getCalendarBusy: vi.fn(),
  refreshGoogleCalendar: vi.fn(),
  disconnectGoogleCalendar: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: vi.fn().mockResolvedValue('token'),
  useIdentityToken: () => ({ identityToken: 'token' }),
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: 'user-a' } }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGateway: () => ({ status: 'ready', paused: false }),
  useDebateGatewayScope: vi.fn(),
  useDebateGatewaySnapshot: () => ({ status: 'ready', paused: false }),
  useDebateGatewaySpaceScopes: vi.fn(),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  getCalendarConnections: mocks.getCalendarConnections,
  getCalendarBusy: mocks.getCalendarBusy,
  refreshGoogleCalendar: mocks.refreshGoogleCalendar,
  disconnectGoogleCalendar: mocks.disconnectGoogleCalendar,
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const invalidatedKeys = (spy: { mock: { calls: Parameters<QueryClient['invalidateQueries']>[] } }) =>
  spy.mock.calls.map(([filters]) => filters?.queryKey);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  setCachedIdentityToken('token');
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe('useCalendarConnections', () => {
  it('asks nothing while disabled', () => {
    renderHook(() => useCalendarConnections(false), { wrapper });
    expect(mocks.getCalendarConnections).not.toHaveBeenCalled();
  });

  it('reads the Google connection', async () => {
    mocks.getCalendarConnections.mockResolvedValue({
      google: { account_email: 'ada@example.com', status: 'ok', stale: false, last_success_at: null, last_error: null },
    });

    const { result } = renderHook(() => useCalendarConnections(true), { wrapper });

    await waitFor(() => expect(result.current.google?.account_email).toBe('ada@example.com'));
  });

  it('reports the server-side switch as disabled', async () => {
    mocks.getCalendarConnections.mockRejectedValue(new GeoChatRequestError('Disabled', 'calendar_disabled', 404));

    const { result } = renderHook(() => useCalendarConnections(true), { wrapper });

    await waitFor(() => expect(result.current.disabled).toBe(true));
  });

  it('does not read other failures as disabled', async () => {
    mocks.getCalendarConnections.mockRejectedValue(new GeoChatRequestError('Down', null, 503));

    const { result } = renderHook(() => useCalendarConnections(true), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.disabled).toBe(false);
  });
});

describe('useCalendarBusy', () => {
  it('waits for a range', () => {
    renderHook(() => useCalendarBusy(null), { wrapper });
    expect(mocks.getCalendarBusy).not.toHaveBeenCalled();
  });
});

describe('calendar mutations', () => {
  const affected = [
    debateQueryKeys.calendarConnections('user-a'),
    debateQueryKeys.calendarBusyRoot('user-a'),
    debateQueryKeys.schedulablePeopleRoot('user-a'),
    debateQueryKeys.peerScheduleRoot('user-a'),
  ];

  it('refresh drops every read busy time changes, even when refused', async () => {
    mocks.refreshGoogleCalendar.mockRejectedValue(new GeoChatRequestError('Slow down', 'rate_limited', 429));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRefreshGoogleCalendar(), { wrapper });
    await act(() => result.current.mutateAsync().catch(() => undefined));

    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(affected));
  });

  it('disconnect drops every read busy time changes', async () => {
    mocks.disconnectGoogleCalendar.mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDisconnectGoogleCalendar(), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(affected));
  });
});
