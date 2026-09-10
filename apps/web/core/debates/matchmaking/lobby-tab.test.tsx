import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobbyTab } from './lobby-tab';
import { debatesHubMatchesOnlyAtom } from '~/atoms';

vi.mock('./claims-tab', () => ({
  ClaimsTab: ({ variant, leading }: { variant?: string; leading?: React.ReactNode }) => (
    <div data-testid="claims-tab" data-variant={variant}>
      {leading}
    </div>
  ),
}));

vi.mock('./matches-list', () => ({
  MatchesList: ({ leading }: { leading?: React.ReactNode }) => <div data-testid="matches-list">{leading}</div>,
}));

const STORAGE_KEY = 'debatesHubMatchesOnly';

function renderLobby(store = createStore()) {
  render(
    <Provider store={store}>
      <LobbyTab onTabChange={vi.fn()} />
    </Provider>
  );

  return store;
}

const toggle = () => screen.getByRole('button', { name: 'Matches only' });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * Lobby is the one answer to "what can I debate right now" (GEO-2861). The two lists behind it are
 * different queries rather than one filtered two ways, so what matters here is which one is drawn,
 * that the control does not move between them, and that the preference outlives the panel.
 */
describe('LobbyTab', () => {
  it('opens on the wider list, with matches only off', () => {
    renderLobby();

    // The wider list can always answer. Opening onto a usually-empty one reads as a broken hub
    // rather than as a filter being on.
    expect(screen.getByTestId('claims-tab')).toHaveAttribute('data-variant', 'lobby');
    expect(screen.queryByTestId('matches-list')).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('swaps to the matches list when toggled on', () => {
    renderLobby();

    fireEvent.click(toggle());

    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab')).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
  });

  // The toggle rides in the filter bar's leading slot on both sides, so it stays under the pointer
  // that just pressed it rather than moving as the list changes.
  it('draws the toggle in the same slot either way', () => {
    renderLobby();

    expect(screen.getByTestId('claims-tab')).toContainElement(toggle());

    fireEvent.click(toggle());

    expect(screen.getByTestId('matches-list')).toContainElement(toggle());
  });

  // Unlike the rest of the filter bar, which is session-scoped on purpose (GEO-2850). This is a
  // standing preference about how you like to arrive at a debate, not working state.
  it('restores the preference from storage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    renderLobby();

    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('writes the preference so it survives the panel closing', () => {
    const store = renderLobby();

    fireEvent.click(toggle());

    expect(store.get(debatesHubMatchesOnlyAtom)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
