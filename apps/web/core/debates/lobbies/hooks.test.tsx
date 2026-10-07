import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView } from '../api';

const api = vi.hoisted(() => ({
  setDebateLobbyPresence: vi.fn(),
  sendDebateLobbyHeartbeat: vi.fn(),
  getDebateLobby: vi.fn(),
  stepOutOfDebateLobby: vi.fn(),
  endDebateLobbyStepOut: vi.fn(),
}));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

const { GeoChatRequestError } = await import('../api');
const { LOBBY_HEARTBEAT_MS, useDebateLobby, useLobbyPresence } = await import('./hooks');
const { consumeLobbyRejoin, requestLobbyRejoin, routeIntoDebate } = await import('./step-out');
const { consumeDebateReturnDestination } = await import('../debate-return-navigation');

/** A presence call that resolves when the test says so. */
function deferredJoin() {
  let resolve: (view: DebateLobbyView) => void = () => undefined;
  api.setDebateLobbyPresence.mockImplementationOnce(() => new Promise<DebateLobbyView>(done => (resolve = done)));
  return (view: DebateLobbyView) => resolve(view);
}

function view(connected: boolean, access: DebateLobbyView['access'] = { status: 'admitted' }): DebateLobbyView {
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
    viewer: {
      role: 'speaker',
      creator: false,
      hosting: false,
      reminded: false,
      voice_away_at: null,
      connected,
      stepped_out: false,
    },
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
  api.sendDebateLobbyHeartbeat.mockResolvedValue({ connection_alive: true, voice_away_at: null });
  api.stepOutOfDebateLobby.mockResolvedValue(view(false));
  api.endDebateLobbyStepOut.mockResolvedValue(view(false));
});

/** Joined, then one heartbeat that says the connection is gone for `reason`. */
async function goneAfterBeat(reason: string, currentLobbyId: string | null = null) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
    connection_alive: false,
    voice_away_at: null,
    reason,
    current_lobby_id: currentLobbyId,
  });
  const hook = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
  await waitFor(() => expect(hook.result.current.state.status).toBe('joined'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
  });
  return hook;
}

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
      new GeoChatRequestError('you are in another lobby', 'already_in_another_lobby', 409, null, {
        current_lobby_id: '000000000000000000000000000000AB',
      })
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
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({ connection_alive: false, voice_away_at: null });
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
  it('says the viewer moved, without rejoining, on reason moved', async () => {
    const { result } = await goneAfterBeat('moved', '000000000000000000000000000000AB');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'moved', otherLobbyId: '000000000000000000000000000000ab' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS * 2);
    });
    expect(joins()).toHaveLength(1);
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('stays stepped out, and sends no leave on unmount, on reason stepped_out', async () => {
    const { result, unmount } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    unmount();
    await act(async () => {});
    expect(joins()).toHaveLength(1);
    expect(leaves()).toHaveLength(0);
  });

  it('stops on reason ended rather than rejoining', async () => {
    const { result } = await goneAfterBeat('ended');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'ended' }));
    expect(joins()).toHaveLength(1);
  });

  it('rejoins on reason lapsed', async () => {
    await goneAfterBeat('lapsed');
    await waitFor(() => expect(joins()).toHaveLength(2));
  });

  // Otherwise the unmount's leave takes the viewer off the roster before the server steps them out.
  it('steps out before routing into a debate, and does not leave on unmount', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    const go = vi.fn();
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(api.stepOutOfDebateLobby).toHaveBeenCalledWith(
      'lobby1',
      { connection_id: expect.any(String) },
      expect.any(Function),
      'acct'
    );
    expect(result.current.state.status).toBe('stepped_out');
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');

    unmount();
    await act(async () => {});
    expect(leaves()).toHaveLength(0);
  });

  it('waits for the viewer to go back after stepping out, then leaves for good on Leave', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    expect(joins()).toHaveLength(0);

    await act(() => result.current.leaveSteppedOut());
    expect(api.endDebateLobbyStepOut).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('left');
  });

  it('joins on arrival when the debate’s end card asked to go back to this lobby', async () => {
    requestLobbyRejoin('lobby1');
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()).toHaveLength(1);
  });

  // GEO-3134: a kick ends the step-out, and the debate still routes back to the lobby.
  it('does not join a viewer a host removed, even back from a debate, until they choose to', async () => {
    requestLobbyRejoin('lobby1');
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, false, false, true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(joins()).toHaveLength(0);
    expect(consumeLobbyRejoin('lobby1')).toBe(false);

    await act(() => result.current.join(false));
    expect(joins()).toHaveLength(1);
    expect(result.current.state.status).toBe('joined');
  });

  it('still returns to the lobby when the server stepped the viewer out before the routing', async () => {
    const { result } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));

    const go = vi.fn();
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');
    expect(api.stepOutOfDebateLobby).not.toHaveBeenCalled();
  });

  it('returns to the lobby when the server step-out and the routing land in the same tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
      connection_alive: false,
      voice_away_at: null,
      reason: 'stepped_out',
      current_lobby_id: null,
    });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    const go = vi.fn();
    // One act, so nothing renders between the heartbeat's answer and the routing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
      routeIntoDebate(go);
    });
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');
    expect(api.stepOutOfDebateLobby).not.toHaveBeenCalled();
  });

  it('does not record the lobby for a viewer who left it', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    await act(() => result.current.leave());

    const go = vi.fn();
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBeNull();
  });

  it('does not let a rejoin left over from an earlier debate skip the prompt', async () => {
    // A Back press whose leave failed, then an arrival that never consumed it.
    requestLobbyRejoin('lobby1');
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    act(() => routeIntoDebate(vi.fn()));
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    unmount();

    const back = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(back.result.current.state.status).toBe('stepped_out'));
    expect(joins()).toHaveLength(1);
  });

  it('clears a rejoin flag on an arrival that was not stepped out', async () => {
    requestLobbyRejoin('lobby1');
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  it('still waits when the rejoin was asked for another lobby', async () => {
    requestLobbyRejoin('lobby2');
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    expect(joins()).toHaveLength(0);
  });

  it('reports voice from the tab that holds it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    act(() => result.current.setVoiceConnected(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });
    expect(api.sendDebateLobbyHeartbeat.mock.calls[0]![1]).toEqual({
      connection_id: result.current.connectionId,
      voice_connected: true,
    });
  });

  // Stepped out by the server from another tab: the view arrives before the next beat.
  it('checks at once when the view says the viewer stepped out', async () => {
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
      connection_alive: false,
      voice_away_at: null,
      reason: 'stepped_out',
    });
    // One client across rerenders, as in the app.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ steppedOut, connected }) => useLobbyPresence('lobby1', true, steppedOut, connected),
      {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
        initialProps: { steppedOut: false, connected: false },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    rerender({ steppedOut: false, connected: true });
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();

    rerender({ steppedOut: true, connected: false });
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
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

// GEO-3134: geo-chat refuses a removed member's join with 409 lobby_removed unless it says `rejoin`.
describe('useLobbyPresence after a host removed the viewer', () => {
  const removed = () => new GeoChatRequestError('raw', 'lobby_removed', 409);
  const lastJoinBody = () => joins().at(-1)?.[1];

  it('lands an automatic join on the removed screen, without retrying', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(joins()).toHaveLength(1);
    expect(lastJoinBody()).not.toHaveProperty('rejoin');
  });

  it('does the same on the end card’s rejoin path', async () => {
    requestLobbyRejoin('lobby1');
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(lastJoinBody()).not.toHaveProperty('rejoin');
  });

  it('does the same on a lapsed lease’s rejoin', async () => {
    api.setDebateLobbyPresence.mockImplementationOnce(async () => view(true)).mockRejectedValueOnce(removed());
    const { result } = await goneAfterBeat('lapsed');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(joins()).toHaveLength(2);
  });

  it('does the same on a back-forward cache restore', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
  });

  it('sends rejoin only from the removed screen’s Rejoin, and keeps it through leaving another lobby', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('dropped'));

    api.setDebateLobbyPresence.mockRejectedValueOnce(
      new GeoChatRequestError('raw', 'already_in_another_lobby', 409, null, { current_lobby_id: 'other' })
    );
    await act(() => result.current.join(false, true));
    expect(lastJoinBody()).toMatchObject({ joined: true, rejoin: true });
    expect(result.current.state).toMatchObject({ status: 'confirm_leave_other', rejoin: true });

    await act(() => result.current.join(true, true));
    expect(lastJoinBody()).toMatchObject({ leave_other_lobby: true, rejoin: true });
    expect(result.current.state.status).toBe('joined');
  });
});

// GEO-3134: an unban sends the target `debate.lobby_changed`; the refetch is admitted with `removed`.
it('moves a ban this tab heard to the removed screen once unbanned, and Rejoin comes back', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
    connection_alive: false,
    voice_away_at: null,
    reason: 'banned',
    current_lobby_id: null,
  });
  const { result, rerender } = renderHook(
    ({ admitted, removed }) => useLobbyPresence('lobby1', admitted, false, false, removed),
    { wrapper, initialProps: { admitted: true, removed: false } }
  );
  await waitFor(() => expect(result.current.state.status).toBe('joined'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
  });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'banned' }));

  // The refetch while banned: access banned, so not admitted.
  rerender({ admitted: false, removed: true });
  expect(result.current.state).toEqual({ status: 'dropped', reason: 'banned' });

  // Unbanned.
  rerender({ admitted: true, removed: true });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
  expect(joins()).toHaveLength(1);

  await act(() => result.current.join(false, true));
  expect(joins().at(-1)?.[1]).toMatchObject({ joined: true, rejoin: true });
  expect(result.current.state.status).toBe('joined');
});
