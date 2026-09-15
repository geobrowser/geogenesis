import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { LobbyTab } from './lobby-tab';
import { debatesHubMatchesOnlyAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  /** What the matches lookup answers, and whether it has answered at all. */
  matches: [{ id: 'match-1' }] as unknown[],
  matchesLoading: false,
  matchesFetching: false,
  matchesError: null as unknown,
  matchesFailureReason: null as unknown,
  /** Whether the wider list reports a corpus with nothing in it — the last rung of the ladder. */
  widerEmpty: false,
}));

vi.mock('./hooks', () => ({
  useMatchmakingMatches: () => ({
    data: { matches: mocks.matches },
    isLoading: mocks.matchesLoading,
    isFetching: mocks.matchesLoading || mocks.matchesFetching,
    error: mocks.matchesError,
    failureReason: mocks.matchesFailureReason,
  }),
}));

vi.mock('./claims-tab', () => ({
  ClaimsTab: ({
    variant,
    trailing,
    onSettledEmpty,
  }: {
    variant?: string;
    trailing?: React.ReactNode;
    onSettledEmpty?: () => void;
  }) => {
    // Stands in for the real tab reporting an unnarrowed, settled, empty corpus.
    React.useEffect(() => {
      if (mocks.widerEmpty) onSettledEmpty?.();
    }, [onSettledEmpty]);

    return (
      <div data-testid="claims-tab" data-variant={variant}>
        {trailing}
      </div>
    );
  },
}));

vi.mock('./matches-list', () => ({
  MatchesList: ({ trailing }: { trailing?: React.ReactNode }) => <div data-testid="matches-list">{trailing}</div>,
}));

const STORAGE_KEY = 'debatesHubMatchesOnly';

function renderLobby(store = createStore(), onTabChange = vi.fn()) {
  const tree = () => (
    <Provider store={store}>
      <LobbyTab onTabChange={onTabChange} />
    </Provider>
  );
  const view = render(tree());

  return Object.assign(store, { onTabChange, rerender: () => view.rerender(tree()) });
}

const toggle = () => screen.getByRole('switch', { name: 'Matches only' });

beforeEach(() => {
  mocks.matches = [{ id: 'match-1' }];
  mocks.matchesLoading = false;
  mocks.matchesFetching = false;
  mocks.matchesError = null;
  mocks.matchesFailureReason = null;
  mocks.widerEmpty = false;
});

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
  it('opens on matches, which is what the hub is for', () => {
    renderLobby();

    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * The reason that default is safe to have.
   *
   * A match needs somebody else online holding the other side, so it is the setting most likely to
   * have nothing behind it — and opening onto an empty list reads as the hub being broken rather
   * than as a filter being set.
   */
  describe('with no match to show', () => {
    beforeEach(() => {
      mocks.matches = [];
    });

    it('steps back to the wider list', () => {
      renderLobby();

      expect(screen.getByTestId('claims-tab')).toHaveAttribute('data-variant', 'lobby');
      expect(screen.queryByTestId('matches-list')).not.toBeInTheDocument();
    });

    // Or the switch is describing something other than the list beneath it, and pressing it would
    // appear to do nothing.
    it('says so on the switch', () => {
      renderLobby();

      expect(toggle()).toHaveAttribute('aria-checked', 'false');
    });

    /**
     * One quiet evening is not a change of mind. Writing the step back would make it one — and over
     * enough evenings would walk every viewer off the setting they chose.
     */
    it('leaves the stored preference alone', () => {
      const store = renderLobby();

      expect(store.get(debatesHubMatchesOnlyAtom)).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBe('false');
    });

    // The viewer outranks the guess. Without this the press is swallowed: the switch reports the
    // effective value, so turning it on writes the preference the value it already held.
    it('lets the viewer ask for the empty list anyway', () => {
      renderLobby();

      fireEvent.click(toggle());

      expect(screen.getByTestId('matches-list')).toBeInTheDocument();
      expect(toggle()).toHaveAttribute('aria-checked', 'true');
    });

    // The last rung: nothing narrowed, nothing matched, and nothing in the wider list either. There
    // is no version of this tab with anything on it, and Explore describes the corpus rather than
    // the viewer, so it always has something.
    it('moves on to Explore when the wider list is empty too', () => {
      mocks.widerEmpty = true;

      const { onTabChange } = renderLobby();

      expect(onTabChange).toHaveBeenCalledWith('explore');
    });

    /**
     * And once, or Lobby becomes a tab the viewer cannot stay on.
     *
     * The hub unmounts this tab when they leave it, so everything the step-back knows is recomputed
     * from scratch on every arrival — and with "Matches only" defaulting on, a viewer with no
     * matches and an empty wider list was walked off Lobby *every time they opened it*. Lobby is
     * the tab the hub opens on, so there was nowhere else for them to be and no way to stay.
     */
    it('does not walk the viewer off Lobby a second time', () => {
      mocks.widerEmpty = true;
      const store = createStore();
      const { onTabChange } = renderLobby(store);
      expect(onTabChange).toHaveBeenCalledWith('explore');

      // Leaving the tab and coming back: a new mount, the same session.
      cleanup();
      const returning = renderLobby(store);

      expect(returning.onTabChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
    });

    /**
     * An outage is not an answer about the viewer.
     *
     * react-query drops `isLoading` on failure, so a failed lookup reads from here exactly like a
     * viewer with nobody to debate. Stepping back on it would take away the list that has the retry
     * and leave them on one that cannot explain itself.
     */
    it('holds the matches list when the lookup failed rather than answered', () => {
      mocks.matchesError = new Error('matches exploded');

      renderLobby();

      expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    });

    it('waits rather than stepping back while the lookup is still out', () => {
      mocks.matchesLoading = true;

      renderLobby();

      expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    });

    /**
     * Including when "still out" looks settled.
     *
     * With something in the cache react-query reports `isLoading: false` while the mount refetch is
     * in flight, so yesterday's empty answer arrives looking like today's. This hook decides once
     * and keeps it, so a viewer with matches waiting would have been stepped back onto the wider
     * list on the strength of a stale one.
     */
    it('does not decide on a cached answer while the refetch is in flight', () => {
      mocks.matchesFetching = true;

      renderLobby();

      expect(screen.getByTestId('matches-list')).toBeInTheDocument();
      expect(toggle()).toHaveAttribute('aria-checked', 'true');
    });
  });

  /**
   * The decision is about arrival, and only about arrival.
   *
   * The matches list is live — the gateway invalidates it as people come and go — so a viewer who
   * arrived on three matches and watched the last one go offline would have had the list swapped
   * out from under them mid-read. That is the same swap the hook refuses in the other direction.
   */
  it('holds the list it arrived on when the last match goes away', () => {
    const store = renderLobby();
    expect(screen.getByTestId('matches-list')).toBeInTheDocument();

    mocks.matches = [];
    store.rerender();

    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * An account geo-chat has not registered cannot answer this tab at all.
   *
   * Every list here is the viewer's own, so all of them are refused for the minute or two after a
   * sign-up — and Lobby is where the hub opens. Explore is the corpus rather than the viewer, so it
   * works throughout. Reported from a fresh account, which sat on a loading skeleton instead.
   *
   * Read from the failure *in flight*: those reads wait the refusal out over about a minute, and
   * until the last attempt fails react-query calls that loading.
   */
  it('moves a viewer whose account is still being set up to Explore', () => {
    mocks.matchesFailureReason = new GeoChatRequestError('not yet', null, 401);

    const { onTabChange } = renderLobby();

    expect(onTabChange).toHaveBeenCalledWith('explore');
  });

  // Once, like the other move: coming back gets them the message and leaves them on it.
  it('leaves them on Lobby if they come back to it', () => {
    mocks.matchesFailureReason = new GeoChatRequestError('not yet', null, 401);
    const store = createStore();
    renderLobby(store);

    cleanup();
    const returning = renderLobby(store);

    expect(returning.onTabChange).not.toHaveBeenCalled();
  });

  // A viewer who turned the switch off and found an empty Lobby asked a question and got an answer.
  // Moving them off the tab would be answering a different one.
  it('stays put when the viewer chose the wider list themselves', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    mocks.widerEmpty = true;

    const { onTabChange } = renderLobby();

    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('swaps to the wider list when toggled off', () => {
    renderLobby();

    fireEvent.click(toggle());

    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('matches-list')).not.toBeInTheDocument();
  });

  // The switch rides at the end of the filter row on both sides, so it stays under the pointer that
  // just pressed it rather than moving as the list changes.
  it('draws the switch in the same slot either way', () => {
    renderLobby();

    expect(screen.getByTestId('matches-list')).toContainElement(toggle());

    fireEvent.click(toggle());

    expect(screen.getByTestId('claims-tab')).toContainElement(toggle());
  });

  // Unlike the rest of the filter bar, which is session-scoped on purpose (GEO-2850). This is a
  // standing preference about how you like to arrive at a debate, not working state.
  it('restores the preference from storage', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    renderLobby();

    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('writes the preference so it survives the panel closing', () => {
    const store = renderLobby();

    fireEvent.click(toggle());

    expect(store.get(debatesHubMatchesOnlyAtom)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});
