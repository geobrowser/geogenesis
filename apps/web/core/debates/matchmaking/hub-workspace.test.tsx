import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubWorkspace } from './hub-workspace';
import {
  debatesHubExploreSearchAtom,
  debatesHubExploreSpaceIdsAtom,
  debatesHubExploreSpaceSeedSpentAtom,
  debatesHubExploreTopicIdsAtom,
} from '~/atoms';

/**
 * The three claim lists are the panel's tabs and have their own suites; this one is about how the
 * workspace lets you move between them, since it has no tab strip to do it with.
 */
vi.mock('./claims-tab', async () => {
  const atoms = await import('~/atoms');
  return {
    // The list a URL means when it names none, so the workspace can follow a bare `/matchmaking`
    // back to Lobby. Mirrored because this file mocks the module wholesale.
    DEFAULT_WORKSPACE_LIST: 'lobby',
    VARIANT_ATOMS: {
      explore: {
        spaceIds: atoms.debatesHubExploreSpaceIdsAtom,
        topicIds: atoms.debatesHubExploreTopicIdsAtom,
        search: atoms.debatesHubExploreSearchAtom,
        seedSpent: atoms.debatesHubExploreSpaceSeedSpentAtom,
      },
      positions: {
        spaceIds: atoms.debatesHubPositionsSpaceIdsAtom,
        topicIds: atoms.debatesHubPositionsTopicIdsAtom,
        search: atoms.debatesHubPositionsSearchAtom,
        seedSpent: atoms.debatesHubPositionsSpaceSeedSpentAtom,
      },
      lobby: {
        spaceIds: atoms.debatesHubLobbySpaceIdsAtom,
        topicIds: atoms.debatesHubLobbyTopicIdsAtom,
        search: atoms.debatesHubLobbySearchAtom,
        seedSpent: atoms.debatesHubLobbySpaceSeedSpentAtom,
      },
    },
    readUrlSeed: (variant: string, query: string) => {
      const params = new URLSearchParams(query);
      const list = params.get('list') ?? 'lobby';
      if (list !== variant) return null;
      return {
        list: params.get('list'),
        search: params.get('q') ?? '',
        spaceIds: (params.get('spaces') ?? '').split(',').filter(Boolean),
        topicIds: (params.get('topics') ?? '').split(',').filter(Boolean),
      };
    },
    ClaimsTab: ({ variant, scopePicker }: { variant?: string; scopePicker?: React.ReactNode }) => {
      const logged = React.useRef(false);
      React.useEffect(() => {
        if (logged.current) return;
        logged.current = true;
        mocks.mounts.push(variant ?? 'explore');
      }, [variant]);
      return <div data-testid={`claims-tab-${variant ?? 'explore'}`}>{scopePicker}</div>;
    },
  };
});

vi.mock('./lobby-tab', () => ({
  LobbyTab: ({ scopePicker }: { scopePicker?: React.ReactNode }) => <div data-testid="lobby-tab">{scopePicker}</div>,
}));

vi.mock('./hub-live-rail', () => ({ HubLiveRail: () => <div data-testid="hub-live-rail" /> }));
// Covered through the side panel's suite; here it only matters that the header draws them.
vi.mock('./hub-header-controls', () => ({ HubHeaderControls: () => <div data-testid="hub-header-controls" /> }));

const mocks = vi.hoisted(() => ({ ready: true, authenticated: true, search: '', mounts: [] as string[] }));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

// The picker reads it on arrival; these cases are about the picker itself.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));

// The picker is a popover, which measures itself. jsdom has no layout and no observer to report it.
beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.search = '';
  mocks.mounts = [];
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

/**
 * Privy reports `ready: false, authenticated: false` until it restores the session.
 */
/**
 * A URL is a complete statement about what is narrowed, so navigating between two URLs for the same
 * list has to apply the difference.
 */
describe('when only the filters change, not the list', () => {
  let store: ReturnType<typeof createStore>;

  /** Its own store, so what the workspace writes is readable and does not leak between cases. */
  function renderWithSearch(initial: string) {
    store = createStore();
    mocks.search = initial;
    const view = render(
      <Provider store={store}>
        <DebatesHubWorkspace />
      </Provider>
    );
    return (next: string) => {
      mocks.search = next;
      view.rerender(
        <Provider store={store}>
          <DebatesHubWorkspace />
        </Provider>
      );
    };
  }

  const exploreSearch = () => store.get(debatesHubExploreSearchAtom);

  it('applies a filter the new URL adds', () => {
    const navigate = renderWithSearch('list=explore');

    navigate('list=explore&q=climate');

    expect(exploreSearch()).toBe('climate');
  });

  // The failing half of the repro: Forward returns to a URL already visited, and its filters have to
  // come back. A spent marker used to refuse exactly this.
  it('re-applies a filter on the way Forward to a URL already seen', () => {
    const navigate = renderWithSearch('list=explore&q=climate');
    expect(exploreSearch()).toBe('climate');

    navigate('list=explore');
    navigate('list=explore&q=climate');

    expect(exploreSearch()).toBe('climate');
  });

  // Clearing, not just adding: an absent `q` means "no search", not "leave the search alone".
  it('clears a filter the new URL leaves out', () => {
    const navigate = renderWithSearch('list=explore&q=climate');

    navigate('list=explore');

    expect(exploreSearch()).toBe('');
  });

  it('applies spaces and topics the same way', () => {
    const navigate = renderWithSearch('list=explore');

    navigate('list=explore&spaces=space-a&topics=t1,t2');

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual(['space-a']);
    expect(store.get(debatesHubExploreTopicIdsAtom)).toEqual(['t1', 't2']);
  });

  // An ordinary arrival at /matchmaking must not read as "the corpus has been chosen", or the
  // membership default a fresh viewer should get is suppressed.
  it('leaves an unfiltered first arrival alone', () => {
    renderWithSearch('');

    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(false);
    expect(exploreSearch()).toBe('');
  });
});

describe('when the URL changes without a remount', () => {
  function renderWithSearch(initial: string) {
    mocks.search = initial;
    const view = render(<DebatesHubWorkspace />);
    /** A same-route navigation: new params, same mounted component. */
    return (next: string) => {
      mocks.search = next;
      view.rerender(<DebatesHubWorkspace />);
    };
  }

  it('follows the URL to the list it names', () => {
    const navigate = renderWithSearch('');
    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();

    navigate('list=positions');

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
  });

  // The other direction. Lobby is omitted from the query as the workspace default.
  it('follows a bare URL back to Lobby', () => {
    const navigate = renderWithSearch('list=positions');
    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();

    navigate('');

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
  });

  // The picker changes the list without touching the query.
  it('leaves a list the viewer picked alone while the URL is unchanged', () => {
    const navigate = renderWithSearch('list=positions');

    fireEvent.click(picker('My positions'));
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();

    navigate('list=positions');

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
  });
});

describe('before Privy has restored the session', () => {
  it('draws no list at all rather than coercing one to Explore', () => {
    mocks.ready = false;
    mocks.search = 'list=positions&spaces=space-a';
    render(<DebatesHubWorkspace />);

    expect(screen.queryByTestId('claims-tab-explore')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-positions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).not.toBeInTheDocument();
  });

  it('draws the list the URL named once it is ready', async () => {
    mocks.search = 'list=positions&spaces=space-a';
    render(<DebatesHubWorkspace />);

    expect(await screen.findByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-explore')).not.toBeInTheDocument();
  });
});

/** The closed trigger, named for whichever list is showing. `getAllBy` — the open menu repeats it. */
const picker = (label: string) => screen.getAllByRole('button', { name: label })[0];

describe('choosing which claim list the workspace shows', () => {
  it('opens on Matches', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(picker('Matches')).toBeInTheDocument();
  });

  // The label changed; the value links and the panel use did not.
  it('still opens Matches from a ?list=lobby link', () => {
    mocks.search = 'list=lobby';
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(picker('Matches')).toBeInTheDocument();
  });

  it('offers the panel’s three lists, in its order', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Matches'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');
    const offered = ['Matches', 'Explore', 'My positions'].map(label => labels.findIndex(text => text.includes(label)));

    expect(offered.every(index => index > -1)).toBe(true);
    expect(offered).toEqual([...offered].sort((a, b) => a - b));
  });

  it('swaps the list rather than narrowing it', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Matches'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  it('remounts the tab when the list changes, rather than reusing the instance', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Matches'));
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(mocks.mounts).toContain('explore');
    expect(mocks.mounts).toContain('positions');
  });

  it('gives Matches its own component, not a ClaimsTab variant', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-lobby')).toBeNull();
  });

  /**
   * Explore describes the corpus, so it answers for anybody. Lobby is scored on who can debate
   * *you* and My positions is the viewer's own list — signed out they are questions with no
   * subject, and the panel draws the same line with `SIGNED_OUT_TABS`.
   */
  it('offers a signed-out viewer only the list that describes the corpus', () => {
    mocks.authenticated = false;
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');

    expect(labels.some(label => label.includes('Explore'))).toBe(true);
    for (const gated of ['Matches', 'My positions']) {
      expect(labels.some(label => label.includes(gated))).toBe(false);
    }
  });

  it('falls back to Explore for a viewer who cannot be offered the list they were on', () => {
    mocks.authenticated = false;
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  it('hands the picker to whichever list is showing', () => {
    render(<DebatesHubWorkspace />);

    expect(within(screen.getByTestId('lobby-tab')).getAllByRole('button', { name: 'Matches' })).toHaveLength(1);

    fireEvent.click(picker('Matches'));
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));

    expect(within(screen.getByTestId('claims-tab-explore')).getAllByRole('button', { name: 'Explore' })).toHaveLength(
      1
    );
  });
});

describe('the header', () => {
  // The side panel's controls, so full screen is not a step away from setting them.
  it('carries the schedule calendar and the availability switch beside the title', () => {
    render(<DebatesHubWorkspace />);

    const header = screen.getByRole('heading', { name: 'Debates' }).closest('header')!;
    expect(within(header).getByTestId('hub-header-controls')).toBeInTheDocument();
  });
});
