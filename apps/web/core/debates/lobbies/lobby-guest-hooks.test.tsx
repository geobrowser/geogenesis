import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyGuestSession } from '../api';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  heartbeat: vi.fn(),
  leave: vi.fn(async () => undefined),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  startDebateLobbyGuest: mocks.start,
  sendDebateLobbyGuestHeartbeat: mocks.heartbeat,
  leaveDebateLobbyGuest: mocks.leave,
}));

const { GeoChatRequestError } = await import('../api');
const { useLobbyGuestSession, lobbyViewForGuest, isGuestLobbyView } = await import('./lobby-guest-hooks');
const { readGuestSecret, storeGuestSecret } = await import('./lobby-guest-secret');

function session(secret = 'secret-1', token = 'token-1'): DebateLobbyGuestSession {
  return {
    guest_id: 'guest1',
    guest_secret: secret,
    lease_expires_at: '2026-10-09T12:01:30Z',
    heartbeat_interval_seconds: 20,
    voice: {
      token,
      url: 'wss://lk',
      room_name: 'geo-lobby-1',
      can_publish: false,
      start_muted: false,
      expires_at: '2026-10-09T12:01:00Z',
    },
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.start.mockReset().mockResolvedValue(session());
  mocks.heartbeat.mockReset().mockResolvedValue({ alive: true, reason: null, lease_expires_at: 'x' });
  mocks.leave.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useLobbyGuestSession', () => {
  it('starts listening once enabled and keeps the secret for a reload', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useLobbyGuestSession('lobby-1', enabled), {
      initialProps: { enabled: false },
    });
    expect(mocks.start).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledWith('lobby1', {});
    expect(readGuestSecret('lobby1')).toBe('secret-1');
  });

  // A second start would take a second place, and its answer would be dropped with the place held.
  it('takes one place through StrictMode’s remount', async () => {
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true), { wrapper: React.StrictMode });
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it('gives back a place answered after the page went', async () => {
    let answer!: (value: DebateLobbyGuestSession) => void;
    mocks.start.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const { unmount } = renderHook(() => useLobbyGuestSession('lobby1', true));
    unmount();
    await act(async () => answer(session('late')));
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'late' }, true);
    expect(readGuestSecret('lobby1')).toBeNull();
  });

  // Signed in and joined before the start answered: that session is over for this page.
  it('gives back a place answered after the member join', async () => {
    let answer!: (value: DebateLobbyGuestSession) => void;
    mocks.start.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('starting'));
    act(() => result.current.release());
    await act(async () => answer(session('late')));
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'late' }, true);
    expect(readGuestSecret('lobby1')).toBeNull();
    expect(result.current.state.status).toBe('idle');
  });

  it('resumes with the stored secret', async () => {
    storeGuestSecret('lobby1', 'kept');
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledWith('lobby1', { guest_secret: 'kept' });
  });

  it('says why it was refused, with when a retry could work', async () => {
    mocks.start.mockRejectedValue(new GeoChatRequestError('full', 'guest_cap_reached', 409, 30_000, { limit: 15 }));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    const state = result.current.state as { message: string; retryAt: number | null };
    expect(state.message).toMatch(/as many listeners without an account/);
    expect(state.retryAt).not.toBeNull();
  });

  it('reads the per-lobby rate limit apart from the visitor’s own', async () => {
    mocks.start.mockRejectedValue(new GeoChatRequestError('slow', 'rate_limited', 429, 5_000, { scope: 'lobby' }));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    expect((result.current.state as { message: string }).message).toMatch(/Lots of people are joining/);
  });

  it('starts afresh when the stored session already ended', async () => {
    storeGuestSecret('lobby1', 'old');
    mocks.start
      .mockRejectedValueOnce(new GeoChatRequestError('ended', 'guest_session_ended', 409))
      .mockResolvedValueOnce(session('secret-2'));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenNthCalledWith(1, 'lobby1', { guest_secret: 'old' });
    expect(mocks.start).toHaveBeenNthCalledWith(2, 'lobby1', {});
    expect(readGuestSecret('lobby1')).toBe('secret-2');
  });

  it('stays removed after a removed secret is refused', async () => {
    mocks.start.mockRejectedValue(new GeoChatRequestError('no', 'lobby_guest_removed', 403));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('removed'));
  });

  it('heartbeats, and only a lapsed lease starts again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));

    mocks.heartbeat.mockResolvedValueOnce({ alive: false, reason: 'lapsed', lease_expires_at: null });
    mocks.start.mockResolvedValueOnce(session('secret-1', 'token-2'));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(mocks.heartbeat).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1' });
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.state.status === 'listening' && result.current.state.session.voice.token).toBe('token-2')
    );

    mocks.heartbeat.mockResolvedValueOnce({ alive: false, reason: 'removed', lease_expires_at: null });
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    await waitFor(() => expect(result.current.state.status).toBe('removed'));
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('leaves on unmount with keepalive', async () => {
    const { result, unmount } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    unmount();
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1' }, true);
  });

  // The member join ended the session: no leave, no heartbeat, but the room keeps playing.
  it('after release, keeps the room and sends nothing more; the handover forgets the secret', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, unmount } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));

    act(() => result.current.release());
    expect(result.current.state.status).toBe('listening');
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    expect(readGuestSecret('lobby1')).toBe('secret-1');

    act(() => result.current.handOver());
    expect(result.current.state.status).toBe('idle');
    expect(readGuestSecret('lobby1')).toBeNull();
    unmount();
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('forgets the secret at the join when no guest room is playing', async () => {
    storeGuestSecret('lobby1', 'kept');
    mocks.start.mockRejectedValue(new GeoChatRequestError('busy', 'voice_capacity_reached', 503));
    const { result } = renderHook(() => useLobbyGuestSession('lobby1', true));
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    act(() => result.current.release());
    expect(readGuestSecret('lobby1')).toBeNull();
  });
});

describe('lobbyViewForGuest', () => {
  it('gives the guest view a viewer with no role and no powers', () => {
    const view = lobbyViewForGuest({
      lobby_id: 'lobby1',
      name: 'Hour',
      access: { status: 'admitted' },
      starts_at: 'x',
      opens_at: 'x',
      scheduled: false,
      created_by: null,
      acting_host_id: null,
      hosts_changed_at: null,
      reminder_count: 0,
      members: [],
      guest_count: 2,
    });
    expect(view.viewer).toMatchObject({ role: null, hosting: false, connected: false });
    expect(view.guest_count).toBe(2);
    expect(isGuestLobbyView(view)).toBe(true);
  });
});
