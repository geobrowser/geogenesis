import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateMyLobby } from '../api';
import {
  clearDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';

const mocks = vi.hoisted(() => ({
  mine: { data: undefined as DebateMyLobby | undefined, isError: false },
}));

vi.mock('./hooks', () => ({ useMyDebateLobby: () => mocks.mine }));

const { useConsumeDebateReturnDestination, useLobbyRejoinOnLeave } = await import('./lobby-return');
const { consumeLobbyRejoin } = await import('./step-out');

const steppedOutOf = (lobbyId: string): DebateMyLobby => ({ current_lobby_id: lobbyId, stepped_out: true });
const notInALobby: DebateMyLobby = { current_lobby_id: null, stepped_out: false };

beforeEach(() => {
  clearDebateReturnDestination();
  consumeLobbyRejoin('');
  mocks.mine = { data: undefined, isError: false };
});

afterEach(cleanup);

describe('useLobbyRejoinOnLeave', () => {
  const leave = () => renderHook(() => useLobbyRejoinOnLeave()).result.current();

  // The case sessionStorage cannot cover: this tab never saw the lobby.
  it('asks the lobby geo-chat says the viewer stepped out of, from another tab, to rejoin', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('prefers geo-chat over this tab’s record', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: notInALobby, isError: false };
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
  });

  // Copilot on #2853: a Leave pressed before a lookup answered went back without the rejoin. It
  // goes where `useConsumeDebateReturnDestination` sends it, so it rejoins whatever that is.
  it('rejoins the lobby in this tab’s record while geo-chat has not answered', () => {
    rememberLobbyReturnDestination('lobby1');
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('falls back to this tab’s record when the call failed', () => {
    mocks.mine = { data: undefined, isError: true };
    rememberLobbyReturnDestination('lobby1');
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('reads the record when Leave is pressed, not when the picker opened', () => {
    const { result } = renderHook(() => useLobbyRejoinOnLeave());
    rememberLobbyReturnDestination('lobby1');
    result.current();
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('asks nothing for a debate that did not start from a lobby', () => {
    rememberDebateReturnDestination('/space/my-space');
    leave();
    expect(consumeLobbyRejoin('lobby1')).toBe(false);
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
