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
vi.mock('./lobby-claim-list-tab', () => ({
  LobbyClaimListTab: ({ list }: { list: { entity_id: string } }) => <p data-testid={`list-tab-${list.entity_id}`} />,
  useClaimListName: (list: { entity_id: string }) => `List ${list.entity_id}`,
}));
vi.mock('./lobby-claim-list-picker', () => ({
  LobbyClaimListPicker: ({ onAdded }: { onAdded: (entityId: string) => void }) => (
    <button type="button" onClick={() => onAdded('p2')}>
      Add a claim list
    </button>
  ),
}));
vi.mock('./lobby-claim-lists-hooks', () => ({
  useSaveLobbyClaimList: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useRemoveLobbyClaimList: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));
vi.mock('./lobby-highlights', () => ({
  LobbyRoomVote: () => null,
  LobbyRoomClaimsWithHighlights: () => <p data-testid="lobby-room-claims" />,
}));

const lobby = {
  lobby_id: 'lobby-1',
  name: 'Onboarding with Adam',
  viewer: { kind: 'member', hosting: false },
} as unknown as LobbyPageView;

const list = (entityId: string, position: number) => ({
  entity_id: entityId,
  space_id: 's1',
  position,
  added_by: null,
  added_at: '2026-10-13T12:00:00Z',
});
const withLists = (lists: ReturnType<typeof list>[], hosting = false) =>
  ({
    ...lobby,
    claim_lists: lists,
    viewer: { kind: 'member', hosting },
  }) as unknown as LobbyPageView;

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

  describe('claim lists', () => {
    it('shows the lobby’s lists as tabs after Explore, in position order', () => {
      render(<LobbyClaimsArea lobby={withLists([list('p2', 1), list('p1', 0)])} />);
      const tabs = screen.getAllByRole('button').map(button => button.textContent);
      expect(tabs.slice(0, 4)).toEqual(['In this room', 'Explore', 'List p1', 'List p2']);

      fireEvent.click(screen.getByRole('button', { name: 'List p2' }));
      expect(screen.getByTestId('list-tab-p2')).toBeTruthy();
    });

    it('gives hosts the + and a menu on each list tab, and nobody else', () => {
      const { rerender } = render(<LobbyClaimsArea lobby={withLists([list('p1', 0)])} />);
      expect(screen.queryByRole('button', { name: 'Add a claim list' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'List p1 options' })).toBeNull();

      rerender(<LobbyClaimsArea lobby={withLists([list('p1', 0)], true)} />);
      expect(screen.getByRole('button', { name: 'Add a claim list' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'List p1 options' })).toBeTruthy();
    });

    it('takes the host to the list they just added', () => {
      const { rerender } = render(<LobbyClaimsArea lobby={withLists([list('p1', 0)], true)} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add a claim list' }));
      rerender(<LobbyClaimsArea lobby={withLists([list('p1', 0), list('p2', 1)], true)} />);
      expect(screen.getByTestId('list-tab-p2')).toBeTruthy();
      expect(screen.queryByTestId('new-list-dot')).toBeNull();
    });

    it('marks a list added mid-visit until it is opened, without moving the viewer', () => {
      const { rerender } = render(<LobbyClaimsArea lobby={withLists([list('p1', 0)])} />);
      // Lists the lobby already had are not news.
      expect(screen.queryByTestId('new-list-dot')).toBeNull();

      rerender(<LobbyClaimsArea lobby={withLists([list('p1', 0), list('p2', 1)])} />);
      expect(screen.getAllByTestId('new-list-dot')).toHaveLength(1);
      expect(screen.getByTestId('lobby-room-claims')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /List p2/ }));
      expect(screen.queryByTestId('new-list-dot')).toBeNull();
    });

    it('leaves the viewer in the room when a removed list is added back', () => {
      const { rerender } = render(<LobbyClaimsArea lobby={withLists([list('p1', 0)])} />);
      fireEvent.click(screen.getByRole('button', { name: 'List p1' }));
      rerender(<LobbyClaimsArea lobby={withLists([])} />);

      // A host adds the same page again later: new tabs never move anyone.
      rerender(<LobbyClaimsArea lobby={withLists([list('p1', 0)])} />);
      expect(screen.getByRole('button', { name: 'In this room' }).getAttribute('aria-current')).toBe('true');
      expect(screen.queryByTestId('list-tab-p1')).toBeNull();
    });

    it('sends whoever was on a removed list back to In this room', () => {
      const { rerender } = render(<LobbyClaimsArea lobby={withLists([list('p1', 0)])} />);
      fireEvent.click(screen.getByRole('button', { name: 'List p1' }));
      expect(screen.getByTestId('list-tab-p1')).toBeTruthy();

      rerender(<LobbyClaimsArea lobby={withLists([])} />);
      expect(screen.getByRole('button', { name: 'In this room' }).getAttribute('aria-current')).toBe('true');
      expect(screen.getByTestId('lobby-room-claims')).toBeTruthy();
    });
  });
});
