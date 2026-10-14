import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyView, DebateMyLobby } from '../api';
import {
  clearDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';

const mocks = vi.hoisted(() => ({
  lobby: undefined as
    (Pick<DebateLobbyView, 'access' | 'name' | 'members'> & { viewer: { removed?: boolean } }) | undefined,
  useDebateLobby: vi.fn(),
  mine: { data: undefined as DebateMyLobby | undefined, isError: false },
}));

vi.mock('./hooks', () => ({
  useDebateLobby: (lobbyId: string, enabled = true) => {
    mocks.useDebateLobby(lobbyId, enabled);
    return { data: mocks.lobby };
  },
  useMyDebateLobby: () => mocks.mine,
}));

const { useConsumeDebateReturnDestination, useLobbyRejoinOnLeave } = await import('./lobby-return');
const { consumeLobbyRejoin } = await import('./step-out');

const member = (id: string, stepped_out = false): DebateLobbyMember => ({
  user_id: id,
  profile_space_id: `space-${id}`,
  display_name: id,
  avatar_cid: null,
  role: 'speaker',
  creator: false,
  acting_host: false,
  on_roster_since: '2026-10-12T10:00:00Z',
  stepped_out,
  in_debate: stepped_out,
});

const admitted = (viewer: { removed?: boolean } = {}) => ({
  access: { status: 'admitted' } as const,
  name: 'Onboarding with Adam',
  members: [member('me', true), member('ana'), member('ben'), member('cy'), member('dee')],
  viewer,
});

const steppedOutOf = (lobbyId: string): DebateMyLobby => ({ current_lobby_id: lobbyId, stepped_out: true });
const notInALobby: DebateMyLobby = { current_lobby_id: null, stepped_out: false };

beforeEach(() => {
  clearDebateReturnDestination();
  consumeLobbyRejoin('');
  mocks.lobby = admitted();
  mocks.useDebateLobby.mockClear();
  mocks.mine = { data: undefined, isError: false };
});

afterEach(cleanup);

describe('useLobbyRejoinOnLeave', () => {
  const leave = () => renderHook(() => useLobbyRejoinOnLeave()).result.current();

  // The case sessionStorage cannot cover: this tab never saw the lobby.
  it('asks the lobby geo-chat says the viewer stepped out of, from another tab, to rejoin', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    leave();
    expect(mocks.useDebateLobby).toHaveBeenCalledWith('lobby1', true);
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('prefers geo-chat over this tab’s record', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: notInALobby, isError: false };
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  it('asks nothing while geo-chat has not answered', () => {
    rememberLobbyReturnDestination('lobby1');
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  it('falls back to this tab’s record when the call failed', () => {
    mocks.mine = { data: undefined, isError: true };
    rememberLobbyReturnDestination('lobby1');
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('asks nothing once the lobby has ended', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    mocks.lobby = { ...admitted(), access: { status: 'closed', reason: 'ended' } };
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  // GEO-3134: a removed viewer goes back by choice, from the lobby page's Rejoin.
  it('asks nothing while a host has the viewer removed', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    mocks.lobby = admitted({ removed: true });
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  it('asks nothing for a debate that did not start from a lobby', () => {
    rememberDebateReturnDestination('/space/my-space');
    mocks.mine = { data: notInALobby, isError: false };
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
    expect(mocks.useDebateLobby).toHaveBeenCalledWith('', false);
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
