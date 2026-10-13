import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLocalVotes, toggleLocalVote } from '~/core/state/local-votes';
import { clearSaveVotesPromptLobby, closeSaveVotesPrompt, openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { LobbyClaimsArea } from './lobby-claims-area';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ guest: false }));

vi.mock('~/core/state/save-votes-prompt', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/save-votes-prompt')>()),
  openSaveVotesPrompt: vi.fn(),
  clearSaveVotesPromptLobby: vi.fn(),
}));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => mocks.guest }));
vi.mock('./lobby-room-claims', () => ({
  LobbyRoomClaims: () => <p data-testid="lobby-room-claims" />,
}));
vi.mock('./lobby-explore-claims', () => ({
  LobbyExploreClaims: () => <p data-testid="lobby-explore-claims" />,
}));
vi.mock('./lobby-highlights', () => ({
  LobbyRoomVote: () => null,
  LobbyRoomClaimsWithHighlights: () => <p data-testid="lobby-room-claims" />,
}));

const lobby = { lobby_id: 'lobby-1', name: 'Onboarding with Adam' } as LobbyPageView;

afterEach(() => {
  cleanup();
  clearLocalVotes();
  closeSaveVotesPrompt();
  mocks.guest = false;
  vi.mocked(openSaveVotesPrompt).mockClear();
  vi.mocked(clearSaveVotesPromptLobby).mockClear();
});

describe('LobbyClaimsArea', () => {
  it('opens on In this room and switches to Explore', () => {
    render(<LobbyClaimsArea lobby={lobby} />);
    expect(screen.getByRole('button', { name: 'In this room' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('lobby-room-claims')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByTestId('lobby-room-claims')).toBeNull();
    expect(screen.getByTestId('lobby-explore-claims')).toBeTruthy();
  });

  it('opens the save sheet with the lobby name when a guest votes', () => {
    mocks.guest = true;
    render(<LobbyClaimsArea lobby={lobby} />);
    act(() => {
      toggleLocalVote({ entityId: 'c1', spaceId: 's1', responseKind: 'stance', direction: 'negative', title: 'Claim' });
    });
    expect(openSaveVotesPrompt).toHaveBeenCalledWith('single_claim', { lobbyName: 'Onboarding with Adam' });
  });

  it('drops the lobby from the save sheet when the claims area goes away', () => {
    const { unmount } = render(<LobbyClaimsArea lobby={lobby} />);
    expect(clearSaveVotesPromptLobby).not.toHaveBeenCalled();
    unmount();
    expect(clearSaveVotesPromptLobby).toHaveBeenCalledTimes(1);
  });
});
