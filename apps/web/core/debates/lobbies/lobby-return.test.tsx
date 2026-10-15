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

const { useConsumeDebateReturnDestination } = await import('./lobby-return');

const steppedOutOf = (lobbyId: string): DebateMyLobby => ({ current_lobby_id: lobbyId, stepped_out: true });
const notInALobby: DebateMyLobby = { current_lobby_id: null, stepped_out: false };
const backIn = (lobbyId: string): DebateMyLobby => ({ current_lobby_id: lobbyId, stepped_out: false });

beforeEach(() => {
  clearDebateReturnDestination();
  mocks.mine = { data: undefined, isError: false };
});

afterEach(cleanup);

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

  // GEO-3337: a lobby tab left open rejoins once the debate is over, which ends the step-out while
  // this flow can still be in the picker.
  it('still returns to the lobby once a rejoin from another tab ends the step-out', () => {
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    const hook = renderHook(() => useConsumeDebateReturnDestination());
    mocks.mine = { data: backIn('lobby1'), isError: false };
    hook.rerender();
    expect(hook.result.current()).toBe('/debate/lobby1');
  });

  it('returns to the page the flow opened from once the viewer leaves the lobby mid-debate', () => {
    rememberDebateReturnDestination('/space/my-space');
    mocks.mine = { data: steppedOutOf('lobby1'), isError: false };
    const hook = renderHook(() => useConsumeDebateReturnDestination());
    mocks.mine = { data: notInALobby, isError: false };
    hook.rerender();
    expect(hook.result.current()).toBe('/space/my-space');
  });

  it('does not return to a lobby the viewer is in that this flow never stepped out of', () => {
    rememberDebateReturnDestination('/space/my-space');
    mocks.mine = { data: backIn('lobby1'), isError: false };
    expect(consume()).toBe('/space/my-space');
  });

  it('uses this tab’s record when geo-chat cannot answer, and clears it', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.mine = { data: undefined, isError: true };
    expect(consume()).toBe('/debate/lobby1');
    expect(consume()).toBeNull();
  });
});
