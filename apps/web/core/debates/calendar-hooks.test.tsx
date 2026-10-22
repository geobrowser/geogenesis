import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

import { GeoChatRequestError } from './api';
import {
  useCalendarBusy,
  useCalendarConnections,
  useConnectCalendar,
  useDisconnectCalendar,
  useRefreshCalendar,
} from './calendar-hooks';
import { debateQueryKeys } from './hooks';

const mocks = vi.hoisted(() => ({
  connectCalendar: vi.fn(),
  getCalendarConnections: vi.fn(),
  getCalendarBusy: vi.fn(),
  refreshCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
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
  connectCalendar: mocks.connectCalendar,
  getCalendarConnections: mocks.getCalendarConnections,
  getCalendarBusy: mocks.getCalendarBusy,
  refreshCalendar: mocks.refreshCalendar,
  disconnectCalendar: mocks.disconnectCalendar,
}));

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

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
  capture.mockReset();
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

  it('reads the configured providers, Google alone from a geo-chat that predates the list', async () => {
    mocks.getCalendarConnections.mockResolvedValueOnce({ google: null });
    const { result } = renderHook(() => useCalendarConnections(true), { wrapper });
    await waitFor(() => expect(result.current.providers).toEqual(['google']));
    expect(result.current.microsoft).toBeNull();

    client.clear();
    mocks.getCalendarConnections.mockResolvedValueOnce({
      providers: ['microsoft', 'apple'],
      google: null,
      microsoft: null,
    });
    const second = renderHook(() => useCalendarConnections(true), { wrapper });
    await waitFor(() => expect(second.result.current.providers).toEqual(['microsoft']));
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
    mocks.refreshCalendar.mockRejectedValue(new GeoChatRequestError('Slow down', 'rate_limited', 429));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRefreshCalendar('google'), { wrapper });
    await act(() => result.current.mutateAsync().catch(() => undefined));

    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(affected));
  });

  it('disconnect drops every read busy time changes', async () => {
    mocks.disconnectCalendar.mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDisconnectCalendar('google'), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(affected));
  });

  it('counts a refresh by its sync outcome, and not at all when refused', async () => {
    mocks.refreshCalendar.mockResolvedValueOnce({ google: null });
    mocks.refreshCalendar.mockRejectedValueOnce(new GeoChatRequestError('Slow down', 'rate_limited', 429));

    const { result } = renderHook(() => useRefreshCalendar('google'), { wrapper });
    await act(() => result.current.mutateAsync());
    await act(() => result.current.mutateAsync().catch(() => undefined));

    expect(capture.mock.calls).toEqual([['calendar_refreshed', { provider: 'google', outcome: 'error' }]]);
  });

  it('shows a refresh whose sync failed straight away', async () => {
    const failed = {
      google: {
        account_email: 'ada@example.com',
        status: 'needs_reconnect' as const,
        stale: true,
        last_success_at: null,
        last_error: 'invalid_grant' as const,
      },
    };
    mocks.refreshCalendar.mockResolvedValue(failed);
    // The refetch that follows never lands, so only the refresh's own answer can update the cache.
    mocks.getCalendarConnections.mockReturnValue(new Promise(() => {}));

    // Mounted with the connection read, as in the editor: unwatched, `gcTime: 0` would drop the entry.
    const { result } = renderHook(
      () => ({ refresh: useRefreshCalendar('google'), connections: useCalendarConnections(true) }),
      {
        wrapper,
      }
    );
    await act(() => result.current.refresh.mutateAsync());

    await waitFor(() => expect(result.current.connections.google).toEqual(failed.google));
    expect(capture).toHaveBeenCalledWith('calendar_refreshed', { provider: 'google', outcome: 'needs_reconnect' });
  });

  it('counts a disconnect once it went through', async () => {
    mocks.disconnectCalendar.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDisconnectCalendar('google'), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(capture.mock.calls).toEqual([['calendar_disconnected', { provider: 'google' }]]);
  });

  it('counts a connect as started, then failed when geo-chat refuses it', async () => {
    mocks.connectCalendar.mockRejectedValue(new GeoChatRequestError('Bad return', 'invalid_return_to', 400));

    const { result } = renderHook(() => useConnectCalendar(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({ provider: 'google', returnTo: 'http://localhost:3002/?modal=schedule', source: 'connect' })
        .catch(() => undefined)
    );

    expect(mocks.connectCalendar.mock.calls[0].slice(0, 2)).toEqual([
      'google',
      'http://localhost:3002/?modal=schedule',
    ]);
    expect(capture.mock.calls).toEqual([
      ['calendar_connect_started', { provider: 'google', source: 'connect' }],
      ['calendar_connect_failed', { provider: 'google', reason: 'invalid_return_to', stage: 'request' }],
    ]);
  });

  it('refreshes Outlook on its own route and counts it by its own connection', async () => {
    mocks.refreshCalendar.mockResolvedValue({
      google: null,
      microsoft: {
        account_email: 'ada@contoso.com',
        status: 'ok',
        stale: false,
        last_success_at: null,
        last_error: null,
      },
    });

    const { result } = renderHook(() => useRefreshCalendar('microsoft'), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(mocks.refreshCalendar.mock.calls[0][0]).toBe('microsoft');
    expect(capture.mock.calls).toEqual([['calendar_refreshed', { provider: 'microsoft', outcome: 'ok' }]]);
  });

  it('counts an Outlook disconnect as microsoft', async () => {
    mocks.disconnectCalendar.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDisconnectCalendar('microsoft'), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(mocks.disconnectCalendar.mock.calls[0][0]).toBe('microsoft');
    expect(capture.mock.calls).toEqual([['calendar_disconnected', { provider: 'microsoft' }]]);
  });
});
