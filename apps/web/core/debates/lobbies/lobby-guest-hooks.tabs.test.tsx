import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyGuestSession } from '../api';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  heartbeat: vi.fn(),
  leave: vi.fn(async () => undefined),
  acquire: vi.fn(),
  release: vi.fn(),
  elsewhere: vi.fn(),
  otherLobby: null as string | null,
  lost: new Set<() => void>(),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  startDebateLobbyGuest: mocks.start,
  sendDebateLobbyGuestHeartbeat: mocks.heartbeat,
  leaveDebateLobbyGuest: mocks.leave,
}));

vi.mock('./lobby-guest-tab-lock', () => ({
  acquireGuestTabLock: mocks.acquire,
  releaseGuestTabLock: mocks.release,
  isGuestListeningElsewhere: mocks.elsewhere,
  lobbyListeningElsewhere: () => mocks.otherLobby,
  onGuestTabLockLost: (listener: () => void) => {
    mocks.lost.add(listener);
    return () => mocks.lost.delete(listener);
  },
}));

const { GeoChatRequestError } = await import('../api');
const { useLobbyGuestSession } = await import('./lobby-guest-hooks');

function session(admission = 1): DebateLobbyGuestSession {
  return {
    guest_id: 'guest1',
    guest_secret: 'secret-1',
    admission,
    lease_expires_at: '2026-10-09T12:01:30Z',
    heartbeat_interval_seconds: 20,
    voice: {
      token: 'token-1',
      url: 'wss://lk',
      room_name: 'geo-lobby-1',
      can_publish: false,
      start_muted: false,
      expires_at: '2026-10-09T12:01:00Z',
    },
  };
}

type Inputs = { listen: boolean; signedIn: boolean; member: 'pending' | 'joined' | 'failed' };
const LISTEN: Inputs = { listen: true, signedIn: false, member: 'pending' };
const renderSession = (initial: Inputs = LISTEN) =>
  renderHook((inputs: Inputs) => useLobbyGuestSession('lobby1', inputs), { initialProps: initial });

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.start.mockReset().mockResolvedValue(session());
  mocks.heartbeat.mockReset().mockResolvedValue({ alive: true, reason: null, lease_expires_at: 'x' });
  mocks.leave.mockClear();
  mocks.acquire.mockReset().mockResolvedValue(true);
  mocks.release.mockReset();
  mocks.elsewhere.mockReset().mockResolvedValue(true);
  mocks.lost.clear();
  mocks.otherLobby = null;
});

afterEach(() => {
  cleanup();
  setVisibility('visible');
});

describe('useLobbyGuestSession across tabs', () => {
  it('waits on a press while another tab listens, then takes listening over', async () => {
    mocks.acquire.mockResolvedValueOnce(false);
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('superseded'));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.otherTabListening).toBe(true);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.acquire).toHaveBeenLastCalledWith({ steal: true, lobbyId: 'lobby1' });
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('says nobody listens once the other tab closed, and still waits on a press', async () => {
    mocks.acquire.mockResolvedValueOnce(false);
    mocks.elsewhere.mockResolvedValue(false);
    const { result } = renderSession();
    await waitFor(() => expect(result.current.otherTabListening).toBe(false));
    expect(result.current.state.status).toBe('superseded');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('stops and leaves its own admission when a tab on another lobby takes listening, without starting again', async () => {
    mocks.otherLobby = 'lobby2';
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));

    act(() => mocks.lost.forEach(listener => listener()));
    expect(result.current.state.status).toBe('superseded');
    expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1', admission: 1 }, true);
    await act(async () => undefined);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalled();
  });

  it('stops without a leave when a tab on this lobby takes listening, and records the lobby on a press', async () => {
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    mocks.otherLobby = 'lobby1';

    act(() => mocks.lost.forEach(listener => listener()));
    expect(result.current.state.status).toBe('superseded');
    expect(mocks.leave).not.toHaveBeenCalled();

    act(() => result.current.retry());
    expect(mocks.acquire).toHaveBeenLastCalledWith({ steal: true, lobbyId: 'lobby1' });
  });

  it('keeps the lock while refused, and lets it go once removed', async () => {
    mocks.start.mockRejectedValueOnce(new GeoChatRequestError('full', 'guest_cap_reached', 409, null, { limit: 50 }));
    const { result } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('refused'));
    expect(mocks.release).not.toHaveBeenCalled();

    mocks.start.mockRejectedValueOnce(new GeoChatRequestError('removed', 'lobby_guest_removed', 403));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('removed'));
    expect(mocks.release).toHaveBeenCalled();
  });

  it('lets the lock go on unmount and at once on pagehide', async () => {
    const { result, unmount } = renderSession();
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(mocks.release).toHaveBeenCalledWith({ now: true });
    unmount();
    expect(mocks.release).toHaveBeenLastCalledWith();
  });

  // A link opened in a background tab must not take a place until someone looks at it.
  it('a hidden tab neither takes the lock nor starts until it is shown', async () => {
    setVisibility('hidden');
    const { result } = renderSession();
    await act(async () => undefined);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');

    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.state.status).toBe('listening'));
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('lets a lock go that was granted after the tab stopped needing it', async () => {
    let grant!: (held: boolean) => void;
    mocks.acquire.mockReturnValueOnce(new Promise<boolean>(resolve => (grant = resolve)));
    const { result, rerender } = renderSession();
    await waitFor(() => expect(mocks.acquire).toHaveBeenCalled());

    rerender({ listen: true, signedIn: true, member: 'joined' });
    expect(result.current.state.status).toBe('released');
    mocks.release.mockClear();
    await act(async () => {
      grant(true);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mocks.release).toHaveBeenCalledWith({ now: true });
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
