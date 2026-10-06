import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView } from '../api';

const api = vi.hoisted(() => ({
  setDebateLobbyPresence: vi.fn(),
  sendDebateLobbyHeartbeat: vi.fn(),
  getDebateLobby: vi.fn(),
}));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

const { GeoChatRequestError } = await import('../api');
const { LOBBY_HEARTBEAT_MS, useDebateLobby, useLobbyPresence } = await import('./hooks');

/** A presence call that resolves when the test says so. */
function deferredJoin() {
  let resolve: (view: DebateLobbyView) => void = () => undefined;
  api.setDebateLobbyPresence.mockImplementationOnce(() => new Promise<DebateLobbyView>(done => (resolve = done)));
  return (view: DebateLobbyView) => resolve(view);
}

function view(present: boolean, access: DebateLobbyView['access'] = { status: 'admitted' }): DebateLobbyView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access,
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    scheduled: false,
    created_by: 'u1',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [],
    viewer: { role: 'speaker', creator: false, hosting: false, reminded: false, voice_away_at: null, present },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const joins = () => api.setDebateLobbyPresence.mock.calls.filter(([, body]) => body.joined);
const leaves = () => api.setDebateLobbyPresence.mock.calls.filter(([, body]) => !body.joined);

beforeEach(() => {
  api.setDebateLobbyPresence.mockImplementation(async (_id: string, body: { joined: boolean }) => view(body.joined));
  api.sendDebateLobbyHeartbeat.mockResolvedValue({ connection_present: true, voice_away_at: null });
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  // Let the leave an unmount queues land before the mocks reset, not in the next test.
  await new Promise(resolve => setTimeout(resolve, 0));
  vi.clearAllMocks();
});

describe('useLobbyPresence', () => {
  it('joins once admitted and leaves on unmount', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()[0]![1]).toMatchObject({ joined: true, leave_other_lobby: false });

    unmount();
    await waitFor(() => expect(leaves()).toHaveLength(1));
    // Sent with keepalive, so it survives navigation.
    expect(leaves()[0]![4]).toBe(true);
  });

  it('does not join a lobby the viewer is not admitted to', async () => {
    renderHook(() => useLobbyPresence('lobby1', false), { wrapper });
    await act(async () => {});
    expect(api.setDebateLobbyPresence).not.toHaveBeenCalled();
  });

  it('asks before leaving another lobby, then joins with leave_other_lobby', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(
      new GeoChatRequestError(
        'you are already in lobby 000000000000000000000000000000ab; leave it to join this one',
        'already_in_another_lobby',
        409
      )
    );
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'confirm_leave_other',
        otherLobbyId: '000000000000000000000000000000ab',
      })
    );
    // Waits for the viewer rather than retrying.
    expect(joins()).toHaveLength(1);

    await act(() => result.current.join(true));
    expect(joins()[1]![1]).toMatchObject({ leave_other_lobby: true });
    expect(result.current.state.status).toBe('joined');
  });

  it('heartbeats while joined and joins again when the lease lapsed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({ connection_present: false, voice_away_at: null });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });

    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledWith(
      'lobby1',
      expect.objectContaining({ voice_connected: false }),
      expect.any(Function),
      'acct'
    );
    await waitFor(() => expect(joins()).toHaveLength(2));
  });

  // Another tab joined a different lobby with leave_other_lobby, dropping this tab's lease.
  it('says the viewer moved when a rejoin after a lapse finds another lobby', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({ connection_present: false, voice_away_at: null });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    api.setDebateLobbyPresence.mockRejectedValueOnce(
      new GeoChatRequestError('x', 'already_in_another_lobby', 409, null, {
        current_lobby_id: '000000000000000000000000000000ab',
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'moved', otherLobbyId: '000000000000000000000000000000ab' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS * 2);
    });
    // No further joins and no heartbeats; the viewer chooses.
    expect(joins()).toHaveLength(2);
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
  });

  // A join answered after Leave must not put the viewer back.
  it('keeps Leave when the join it raced resolves afterwards', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resolveJoin = deferredJoin();
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joining'));

    const leaving = result.current.leave();
    resolveJoin(view(true));
    await act(() => leaving);

    expect(result.current.state.status).toBe('left');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS * 2);
    });
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();
    expect(joins()).toHaveLength(1);
    expect(leaves()).toHaveLength(1);
  });

  // Otherwise the server keeps the viewer present and the next lobby answers 409.
  it('sends the leave when unmounted with a join in flight', async () => {
    const resolveJoin = deferredJoin();
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joining'));

    unmount();
    resolveJoin(view(true));
    await waitFor(() => expect(leaves()).toHaveLength(1));
  });

  // Chrome throttles a long-hidden tab's timers; returning beats at once, but not on every quick
  // tab switch, which would run into the 30-a-minute heartbeat limit.
  it('heartbeats when a tab returns after a long gap, not on a quick switch', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();

    // A throttled tab: the clock moved on, the interval did not fire.
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1));

    clock.mockRestore();
    visibility.mockRestore();
  });

  // geo-chat: a heartbeat 429 waits out Retry-After; a rejoin would be limited too.
  it('backs off a rate-limited heartbeat without rejoining', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockRejectedValueOnce(
      new GeoChatRequestError('slow down', 'rate_limited', 429, 2_000)
    );
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(2);
    expect(joins()).toHaveLength(1);
  });

  it('retries an automatic join once after Retry-After', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.setDebateLobbyPresence.mockRejectedValueOnce(new GeoChatRequestError('slow down', 'rate_limited', 429, 1_000));
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()).toHaveLength(2);
  });

  it('stays out after Leave', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(() => result.current.leave());
    expect(result.current.state.status).toBe('left');
    expect(leaves()).toHaveLength(1);

    unmount();
    await act(async () => {});
    // No second leave, and no rejoin.
    expect(leaves()).toHaveLength(1);
    expect(joins()).toHaveLength(1);
  });
});

describe('useDebateLobby', () => {
  // `debate.lobby_changed` only reaches present members, so nobody would tell this page.
  it('refetches a lobby that is not yet open when it opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    api.getDebateLobby
      .mockResolvedValueOnce(view(false, { status: 'not_yet_open', opens_at: opensAt }))
      .mockResolvedValue(view(false));
    const { result } = renderHook(() => useDebateLobby('lobby1'), { wrapper });
    await waitFor(() => expect(result.current.data?.access.status).toBe('not_yet_open'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(result.current.data?.access.status).toBe('admitted'));
    expect(api.getDebateLobby).toHaveBeenCalledTimes(2);
  });

  // Nothing else refetches this page, so one failed refetch at opens_at must not end the retries.
  it('tries again after the refetch at opens_at fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    api.getDebateLobby
      .mockResolvedValueOnce(view(false, { status: 'not_yet_open', opens_at: opensAt }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(view(false));
    const { result } = renderHook(() => useDebateLobby('lobby1'), { wrapper });
    await waitFor(() => expect(result.current.data?.access.status).toBe('not_yet_open'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(api.getDebateLobby).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    await waitFor(() => expect(result.current.data?.access.status).toBe('admitted'));
  });
});
