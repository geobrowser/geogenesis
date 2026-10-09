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
const { useLobbyGuestSession } = await import('./lobby-guest-hooks');
const { isMemberView, lobbyViewForGuest, lobbyViewForMember } = await import('./lobby-view');
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

type Inputs = { listen: boolean; signedIn: boolean; member: 'pending' | 'joined' | 'failed' };
const LISTEN: Inputs = { listen: true, signedIn: false, member: 'pending' };

function renderSession(initial: Inputs = LISTEN, options: { strict?: boolean } = {}) {
  return renderHook((inputs: Inputs) => useLobbyGuestSession('lobby1', inputs), {
    initialProps: initial,
    ...(options.strict ? { wrapper: React.StrictMode } : {}),
  });
}

function deferred() {
  let answer!: (value: DebateLobbyGuestSession) => void;
  const promise = new Promise<DebateLobbyGuestSession>(resolve => (answer = resolve));
  return { promise, answer };
}

describe('useLobbyGuestSession', () => {
  it('starts listening once allowed and keeps the secret for a reload', async () => {
    const { result, rerender } = renderSession({ ...LISTEN, listen: false });
    expect(mocks.start).not.toHaveBeenCalled();

    rerender(LISTEN);
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledWith('lobby1', {});
    expect(readGuestSecret('lobby1')).toBe('secret-1');
  });

  // A second start would take a second place, and its answer would be dropped with the place held.
  it('takes one place through StrictMode’s remount', async () => {
    const { result } = renderSession(LISTEN, { strict: true });
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it('never starts for someone signed in', async () => {
    const { result } = renderSession({ ...LISTEN, signedIn: true });
    await act(async () => undefined);
    act(() => result.current.retry());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('gives back a new place answered after the page went', async () => {
    const late = deferred();
    mocks.start.mockReturnValue(late.promise);
    const { unmount } = renderSession();
    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    unmount();
    await act(async () => late.answer(session('late')));
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'late' }, true);
    expect(readGuestSecret('lobby1')).toBeNull();
  });

  // The backend resumes on the same secret, so the old page's leave would end the new page's session.
  it('leaves nothing when a page unmounts mid-resume and a new one resumed the same secret', async () => {
    storeGuestSecret('lobby1', 'kept');
    const first = deferred();
    mocks.start.mockReturnValueOnce(first.promise);
    const old = renderSession();
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    old.unmount();

    mocks.start.mockResolvedValueOnce(session('kept'));
    const next = renderSession();
    await waitFor(() => expect(next.result.current.state.status).toBe('listening'));
    await act(async () => first.answer(session('kept')));
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(readGuestSecret('lobby1')).toBe('kept');
  });

  it('gives back a place answered after the member join', async () => {
    const late = deferred();
    mocks.start.mockReturnValue(late.promise);
    const { result, rerender } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('starting'));
    rerender({ listen: false, signedIn: true, member: 'joined' });
    expect(result.current.state.status).toBe('released');
    await act(async () => late.answer(session('late')));
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'late' }, true);
    expect(readGuestSecret('lobby1')).toBeNull();
  });

  it('gives back a place answered after sign-in, before any join', async () => {
    const late = deferred();
    mocks.start.mockReturnValue(late.promise);
    const { result, rerender } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('starting'));
    rerender({ listen: false, signedIn: true, member: 'pending' });
    await act(async () => late.answer(session('late')));
    expect(result.current.state.status).toBe('released');
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'late' }, true);
  });

  it('resumes with the stored secret', async () => {
    storeGuestSecret('lobby1', 'kept');
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledWith('lobby1', { guest_secret: 'kept' });
  });

  it('says why it was refused, with when a retry could work, and retries on request', async () => {
    mocks.start.mockRejectedValueOnce(new GeoChatRequestError('full', 'guest_cap_reached', 409, 30_000, { limit: 15 }));
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    const state = result.current.state as { message: string; retryAt: number | null };
    expect(state.message).toMatch(/as many listeners without an account/);
    expect(state.retryAt).not.toBeNull();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('reads the per-lobby rate limit apart from the visitor’s own', async () => {
    mocks.start.mockRejectedValue(new GeoChatRequestError('slow', 'rate_limited', 429, 5_000, { scope: 'lobby' }));
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    expect((result.current.state as { message: string }).message).toMatch(/Lots of people are joining/);
  });

  it('starts afresh when the stored session already ended', async () => {
    storeGuestSecret('lobby1', 'old');
    mocks.start
      .mockRejectedValueOnce(new GeoChatRequestError('ended', 'guest_session_ended', 409))
      .mockResolvedValueOnce(session('secret-2'));
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.start).toHaveBeenNthCalledWith(1, 'lobby1', { guest_secret: 'old' });
    expect(mocks.start).toHaveBeenNthCalledWith(2, 'lobby1', {});
    expect(readGuestSecret('lobby1')).toBe('secret-2');
  });

  it('stays removed after a removed secret is refused', async () => {
    mocks.start.mockRejectedValue(new GeoChatRequestError('no', 'lobby_guest_removed', 403));
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('removed'));
  });

  it('heartbeats, and only a lapsed lease starts again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderSession();
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

  it('a lapse after sign-in does not start a guest again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    rerender({ listen: false, signedIn: true, member: 'pending' });

    mocks.heartbeat.mockResolvedValueOnce({ alive: false, reason: 'lapsed', lease_expires_at: null });
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    await waitFor(() => expect(result.current.state.status).toBe('released'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('leaves on unmount with keepalive', async () => {
    const { result, unmount } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    unmount();
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1' }, true);
  });

  // The member join ended the session: no leave, no heartbeat, but the room keeps playing.
  it('hands over on the member join and forgets the secret once the member room is up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender, unmount } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));

    rerender({ listen: false, signedIn: true, member: 'joined' });
    expect(result.current.state.status).toBe('handingOver');
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    expect(readGuestSecret('lobby1')).toBe('secret-1');

    act(() => result.current.roomDone());
    expect(result.current.state.status).toBe('released');
    expect(readGuestSecret('lobby1')).toBeNull();
    unmount();
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  // Signed in but not joining here (another lobby, banned, refused): no phantom guest.
  it('leaves as a guest when the signed-in path fails', async () => {
    const { result, rerender } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    rerender({ listen: false, signedIn: true, member: 'failed' });
    expect(result.current.state.status).toBe('released');
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1' }, true);
    expect(readGuestSecret('lobby1')).toBeNull();
  });

  it('forgets the secret at the join when no guest room is playing', async () => {
    storeGuestSecret('lobby1', 'kept');
    mocks.start.mockRejectedValue(new GeoChatRequestError('busy', 'voice_capacity_reached', 503));
    const { result, rerender } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    rerender({ listen: false, signedIn: true, member: 'joined' });
    expect(result.current.state.status).toBe('released');
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
    expect(isMemberView(view)).toBe(false);
    expect(view.viewer.kind).toBe('guest');
  });
});

describe('lobbyViewForMember', () => {
  it('tags a member view so member-only parts accept it', () => {
    const view = lobbyViewForMember({
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
      viewer: {
        role: 'host',
        creator: true,
        hosting: true,
        reminded: false,
        voice_away_at: null,
        connected: true,
        stepped_out: false,
        last_moderation: null,
      },
    });
    expect(isMemberView(view)).toBe(true);
    expect(view.viewer).toMatchObject({ kind: 'member', hosting: true, last_moderation: null });
  });
});
