import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView } from '../api';
import { LobbyClaimsArea } from './lobby-claims-area';

vi.mock('./lobby-room-claims', () => ({
  LobbyRoomClaims: () => <p data-testid="lobby-room-claims" />,
}));

const lobby = { lobby_id: 'lobby-1' } as DebateLobbyView;

afterEach(cleanup);

describe('LobbyClaimsArea', () => {
  it('opens on In this room and switches to Explore', () => {
    render(<LobbyClaimsArea lobby={lobby} />);
    expect(screen.getByRole('button', { name: 'In this room' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('lobby-room-claims')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByTestId('lobby-room-claims')).toBeNull();
    expect(screen.getByTestId('lobby-explore-placeholder')).toBeTruthy();
  });
});
