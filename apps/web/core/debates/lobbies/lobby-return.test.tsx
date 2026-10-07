import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView, DebateMyLobby } from '../api';
import {
  clearDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';

const mocks = vi.hoisted(() => ({
  lobby: undefined as { access: DebateLobbyView['access']; viewer: { removed?: boolean } } | undefined,
  useDebateLobby: vi.fn(),
  lobbyJoining: true,
  mine: { data: undefined as DebateMyLobby | undefined, isError: false },
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.lobbyJoining }));

vi.mock('./hooks', () => ({
  useDebateLobby: (lobbyId: string) => {
    mocks.useDebateLobby(lobbyId);
    return { data: mocks.lobby };
  },
  useMyDebateLobby: () => mocks.mine,
}));

const { BackToLobbyRow, useConsumeDebateReturnDestination } = await import('./lobby-return');
const { consumeLobbyRejoin } = await import('./step-out');

const steppedOutOf = (lobbyId: string): DebateMyLobby => ({ current_lobby_id: lobbyId, stepped_out: true });
const notInALobby: DebateMyLobby = { current_lobby_id: null, stepped_out: false };

beforeEach(() => {
  clearDebateReturnDestination();
  consumeLobbyRejoin('');
  mocks.lobby = { access: { status: 'admitted' }, viewer: {} };
  mocks.useDebateLobby.mockClear();
  mocks.lobbyJoining = true;
  mocks.mine = { data: undefined, isError: false };
});

afterEach(cleanup);

const backButton = () => screen.queryByRole('button', { name: 'Back to the room' });

describe('BackToLobbyRow', () => {
  // The case sessionStorage cannot cover: this tab never saw the lobby.
  it('offers the lobby geo-chat says the viewer stepped out of, from another tab, and asks it to rejoin', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    const onLeave = vi.fn();
    render(<BackToLobbyRow onLeave={onLeave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to the room' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(mocks.useDebateLobby).toHaveBeenCalledWith('lobby1');
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('prefers geo-chat over this tab’s record', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: notInALobby, isError: false };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).toBeNull();
  });

  it('is hidden while geo-chat has not answered', () => {
    rememberLobbyReturnDestination('lobby1');
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).toBeNull();
  });

  it.each([
    ['the call failed', () => (mocks.mine = { data: undefined, isError: true })],
    ['the flag is off', () => (mocks.lobbyJoining = false)],
  ])('falls back to this tab’s record when %s', (_label, arrange) => {
    arrange();
    rememberLobbyReturnDestination('lobby1');
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).not.toBeNull();
  });

  it('is hidden once the lobby has ended', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    mocks.lobby = { access: { status: 'closed', reason: 'ended' }, viewer: {} };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).toBeNull();
  });

  // GEO-3134: a removed viewer goes back by choice, from the lobby page's Rejoin.
  it('is hidden while a host has the viewer removed', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    mocks.lobby = { access: { status: 'admitted' }, viewer: { removed: true } };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).toBeNull();
  });

  it('is hidden for a debate that did not start from a lobby', () => {
    rememberDebateReturnDestination('/space/my-space');
    mocks.mine = { data: notInALobby, isError: false };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(backButton()).toBeNull();
    expect(mocks.useDebateLobby).not.toHaveBeenCalled();
  });
});

describe('useConsumeDebateReturnDestination', () => {
  const consume = () => renderHook(() => useConsumeDebateReturnDestination()).result.current();

  it('returns to the lobby geo-chat names, even with no record in this tab', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    expect(consume()).toBe('/debate/lobby1');
  });

  it('drops this tab’s lobby once geo-chat says the viewer is in none', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: notInALobby, isError: false };
    expect(consume()).toBeNull();
  });

  it('keeps an ordinary page this tab came from', () => {
    rememberDebateReturnDestination('/space/my-space');
    mocks.mine = { data: notInALobby, isError: false };
    expect(consume()).toBe('/space/my-space');
  });

  it('uses this tab’s record when geo-chat cannot answer, and clears it', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: undefined, isError: true };
    expect(consume()).toBe('/debate/lobby1');
    expect(consume()).toBeNull();
  });
});
