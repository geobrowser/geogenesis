import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView } from '../api';
import {
  clearDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';

const mocks = vi.hoisted(() => ({
  lobby: undefined as { access: DebateLobbyView['access']; viewer: { removed?: boolean } } | undefined,
  useDebateLobby: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useDebateLobby: (lobbyId: string) => {
    mocks.useDebateLobby(lobbyId);
    return { data: mocks.lobby };
  },
}));

const { BackToLobbyRow } = await import('./lobby-return');
const { consumeLobbyRejoin } = await import('./step-out');

beforeEach(() => {
  clearDebateReturnDestination();
  consumeLobbyRejoin('');
  mocks.lobby = { access: { status: 'admitted' }, viewer: {} };
  mocks.useDebateLobby.mockClear();
});

afterEach(cleanup);

describe('BackToLobbyRow', () => {
  it('offers the lobby the viewer stepped out of while it is open, and asks it to rejoin', () => {
    rememberLobbyReturnDestination('lobby1');
    const onLeave = vi.fn();
    render(<BackToLobbyRow onLeave={onLeave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to the room' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(mocks.useDebateLobby).toHaveBeenCalledWith('lobby1');
    expect(consumeLobbyRejoin('lobby1')).toBe(true);
  });

  it('is hidden once the lobby has ended', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.lobby = { access: { status: 'closed', reason: 'ended' }, viewer: {} };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Back to the room' })).toBeNull();
  });

  // GEO-3134: a removed viewer goes back by choice, from the lobby page's Rejoin.
  it('is hidden while a host has the viewer removed', () => {
    rememberLobbyReturnDestination('lobby1');
    mocks.lobby = { access: { status: 'admitted' }, viewer: { removed: true } };
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Back to the room' })).toBeNull();
  });

  it('is hidden for a debate that did not start from a lobby', () => {
    rememberDebateReturnDestination('/space/my-space');
    render(<BackToLobbyRow onLeave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Back to the room' })).toBeNull();
    expect(mocks.useDebateLobby).not.toHaveBeenCalled();
  });
});
