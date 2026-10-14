import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lastPageOutsideDebates, rememberLastPageOutsideDebates } from '../debate-return-navigation';
import type { LobbyPresenceState } from './hooks';
import { useExitLobbyWhenOut, useLobbyExitHref } from './lobby-exit';
import type { GuestSessionState } from './lobby-guest-session';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), toast: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/debate/lobby-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.toast }));

type Props = {
  access: LobbyPageView['access'] | null;
  presence: LobbyPresenceState;
  guestStatus: GuestSessionState['status'];
  fresh: boolean;
};

const ADMITTED: LobbyPageView['access'] = { status: 'admitted' };
const ENDED: LobbyPageView['access'] = { status: 'closed', reason: 'ended' };
const BANNED = { status: 'banned' } as LobbyPageView['access'];

function renderExit(initial: Props) {
  return renderHook(
    (props: Props) => useExitLobbyWhenOut({ ...props, name: 'Friday debates', exitHref: '/space/s1/e1' }),
    { initialProps: initial }
  );
}

const joined: Props = { access: ADMITTED, presence: { status: 'joined' }, guestStatus: 'idle', fresh: true };

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.replace.mockReset();
  mocks.toast.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useExitLobbyWhenOut', () => {
  it('goes back on Leave, without a toast', () => {
    const { result, rerender } = renderExit(joined);
    expect(result.current).toBe(false);
    rerender({ ...joined, presence: { status: 'left' } });
    expect(result.current).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith('/space/s1/e1');
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each([
    ['ended', 'This lobby has ended'],
    ['removed', 'A host removed you from this lobby.'],
    ['banned', 'A host has blocked you from Friday debates.'],
  ] as const)('goes back with a toast when dropped as %s', (reason, notice) => {
    const { rerender } = renderExit(joined);
    rerender({ ...joined, presence: { status: 'dropped', reason } });
    expect(mocks.replace).toHaveBeenCalledWith('/space/s1/e1');
    expect(mocks.toast.mock.calls[0][0].props.children).toBe(notice);
  });

  it('goes back once the lobby closes or bans the viewer while the page is open', () => {
    const ended = renderExit(joined);
    ended.rerender({ ...joined, access: ENDED });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    ended.unmount();

    const banned = renderExit({ ...joined, presence: { status: 'idle' } });
    banned.rerender({ ...joined, presence: { status: 'idle' }, access: BANNED });
    expect(mocks.replace).toHaveBeenCalledTimes(2);
  });

  it('leaves the card in place for a lobby that had already ended or banned them on arrival', () => {
    const { result, rerender } = renderExit({ ...joined, access: null, presence: { status: 'idle' } });
    rerender({ ...joined, access: ENDED, presence: { status: 'idle' } });
    rerender({ ...joined, access: BANNED, presence: { status: 'idle' } });
    expect(result.current).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('takes only a view read on this page as the lobby having been open here, not a cached one', () => {
    // Back on a lobby seen open a minute ago: the cache says open until the refetch says ended.
    const arrival: Props = { access: ADMITTED, presence: { status: 'idle' }, guestStatus: 'idle', fresh: false };
    const { result, rerender } = renderExit(arrival);
    rerender({ ...arrival, access: ENDED, fresh: true });
    expect(result.current).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps the removed notice for someone removed before this visit', () => {
    const { rerender } = renderExit({ ...joined, presence: { status: 'idle' } });
    rerender({ ...joined, presence: { status: 'dropped', reason: 'removed' } });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('goes back when a host removes a listening guest, but not one removed on arrival', () => {
    const guest: Props = { access: ADMITTED, presence: { status: 'idle' }, guestStatus: 'starting', fresh: true };
    const arrival = renderExit(guest);
    arrival.rerender({ ...guest, guestStatus: 'removed' });
    expect(mocks.replace).not.toHaveBeenCalled();
    arrival.unmount();

    const listening = renderExit({ ...guest, guestStatus: 'listening' });
    listening.rerender({ ...guest, guestStatus: 'removed' });
    expect(mocks.replace).toHaveBeenCalledWith('/space/s1/e1');
  });

  it('navigates only once, and stays leaving until the route changes', () => {
    const { result, rerender } = renderExit(joined);
    rerender({ ...joined, presence: { status: 'dropped', reason: 'ended' } });
    rerender({ ...joined, presence: { status: 'dropped', reason: 'ended' }, access: ENDED });
    // A refetch reopening the view must not bring the card back mid-navigation.
    rerender({ ...joined, presence: { status: 'idle' } });
    expect(result.current).toBe(true);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});

describe('the page before the lobby', () => {
  it('skips lobbies and debate rooms, so the page that opened the lobby survives a debate', () => {
    rememberLastPageOutsideDebates('/space/s1/e1?tab=debates');
    rememberLastPageOutsideDebates('/debate/lobby-1');
    rememberLastPageOutsideDebates('/space/s1/debates/d1');
    expect(lastPageOutsideDebates()).toBe('/space/s1/e1?tab=debates');
  });

  it('ignores an href that would leave the site', () => {
    rememberLastPageOutsideDebates('//evil.example/path');
    expect(lastPageOutsideDebates()).toBeNull();
  });

  it('is read once, when the lobby page mounts, and falls back to Explore', () => {
    const fallback = renderHook(() => useLobbyExitHref());
    expect(fallback.result.current).toBe('/explore');

    rememberLastPageOutsideDebates('/space/s1/e1');
    const stored = renderHook(() => useLobbyExitHref());
    expect(stored.result.current).toBe('/space/s1/e1');
    rememberLastPageOutsideDebates('/space/s2/e2');
    stored.rerender();
    expect(stored.result.current).toBe('/space/s1/e1');
  });
});
