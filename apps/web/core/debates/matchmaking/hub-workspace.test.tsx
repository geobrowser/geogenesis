import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubWorkspace, URL_SYNC_DELAY_MS } from './hub-workspace';
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
// Keep the URL defaults, parser, and filter atoms real; only stub the list's rendering.
vi.mock('./claims-tab', async importOriginal => {
  const actual = await importOriginal<typeof import('./claims-tab')>();
  return {
    ...actual,
    useRecordHubTabPress: () => mocks.recordTabPress,
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
// The callout and its day's set have their own suites; here it only matters where it is drawn.
const todaysCallout = vi.hoisted(() => ({ visible: false }));
vi.mock('../todays-claims/use-todays-callout', () => ({ useTodaysCallout: () => todaysCallout }));
vi.mock('./todays-claims-callout', () => ({
  TodaysClaimsCallout: ({ layout, onFindDebate }: { layout: string; onFindDebate: () => void }) => (
    <button type="button" data-testid="todays-claims-callout" data-layout={layout} onClick={onFindDebate}>
      Find a debate
    </button>
  ),
}));
// The open ask is the strip's and the cards' business, covered in their own suites.
vi.mock('./hub-ask-context', () => ({ HubAskProvider: ({ children }: { children: React.ReactNode }) => children }));
// Covered through the side panel's suite; here it only matters that the header draws them.
vi.mock('./hub-header-controls', () => ({ HubHeaderControls: () => <div data-testid="hub-header-controls" /> }));

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  mounts: [] as string[],
  recordTabPress: vi.fn(),
}));

/**
 * The address bar, which is both what `useSearchParams` reads and what the workspace writes to. In
 * the app Next re-renders on a `replaceState`; here a test rerenders when it wants the read.
 */
function setUrl(search: string) {
  window.history.replaceState(null, '', search ? `/matchmaking?${search}` : '/matchmaking');
}
const currentSearch = () => window.location.search.replace(/^\?/, '');

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

// The picker reads it on arrival; these cases are about the picker itself.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

// The picker is a popover, which measures itself. jsdom has no layout and no observer to report it.
beforeEach(() => {
  todaysCallout.visible = false;
  mocks.ready = true;
  mocks.authenticated = true;
  setUrl('');
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
    setUrl(initial);
    const view = render(
      <Provider store={store}>
        <DebatesHubWorkspace />
      </Provider>
    );
    return (next: string) => {
      setUrl(next);
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

// GEO-3498. Under the title, and its one action once done is Matches.
describe('the Today’s claims callout', () => {
  it('sits under the title only when there is one, and opens Matches once done', () => {
    render(<DebatesHubWorkspace />);
    expect(screen.queryByTestId('todays-claims-callout')).not.toBeInTheDocument();
    cleanup();

    todaysCallout.visible = true;
    render(<DebatesHubWorkspace />);
    const callout = screen.getByTestId('todays-claims-callout');
    expect(callout).toHaveAttribute('data-layout', 'hub');
    expect(screen.getByRole('heading', { level: 1, name: 'Debates' }).compareDocumentPosition(callout)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    fireEvent.click(callout);
    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
  });
});

describe('when the URL changes without a remount', () => {
  function renderWithSearch(initial: string) {
    setUrl(initial);
    const view = render(<DebatesHubWorkspace />);
    /** A same-route navigation: new params, same mounted component. */
    return (next: string) => {
      setUrl(next);
      view.rerender(<DebatesHubWorkspace />);
    };
  }

  it('follows the URL to the list it names', () => {
    const navigate = renderWithSearch('');
    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();

    navigate('list=positions');

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
  });

  // The other direction. Explore is omitted from the query as the workspace default.
  it('follows a bare URL back to Explore', () => {
    const navigate = renderWithSearch('list=positions');
    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();

    navigate('');

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
  });

  // The workspace's own write is not a navigation, so it must not be read back as one.
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
    setUrl('list=positions&spaces=space-a');
    render(<DebatesHubWorkspace />);

    expect(screen.queryByTestId('claims-tab-explore')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-positions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).not.toBeInTheDocument();
  });

  it('draws the list the URL named once it is ready', async () => {
    setUrl('list=positions&spaces=space-a');
    render(<DebatesHubWorkspace />);

    expect(await screen.findByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-explore')).not.toBeInTheDocument();
  });
});

/** The closed trigger, named for whichever list is showing. `getAllBy` — the open menu repeats it. */
const picker = (label: string) => screen.getAllByRole('button', { name: label })[0];

describe('choosing which claim list the workspace shows', () => {
  it('opens on Explore', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
    expect(picker('Explore')).toBeInTheDocument();
  });

  // The label changed; the value links and the panel use did not.
  it('still opens Matches from a ?list=lobby link', () => {
    setUrl('list=lobby');
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(picker('Matches')).toBeInTheDocument();
  });

  it('offers Explore first, followed by Matches and My positions', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    const labels = within(screen.getByRole('dialog'))
      .getAllByRole('button')
      .map(option => option.textContent);

    expect(labels).toEqual(['Explore', 'Matches', 'My positions']);
  });

  it('swaps the list rather than narrowing it', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  // GEO-3495: the same recorder as the side panel's tab row, from the list on screen to the one picked.
  it('records the list the viewer picks', () => {
    mocks.recordTabPress.mockClear();
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(mocks.recordTabPress).toHaveBeenCalledExactlyOnceWith('positions');
  });

  it('remounts the tab when the list changes, rather than reusing the instance', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(mocks.mounts).toContain('explore');
    expect(mocks.mounts).toContain('positions');
  });

  it('gives Matches its own component, not a ClaimsTab variant', () => {
    setUrl('list=lobby');
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
    setUrl('list=lobby');
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  it('hands the picker to whichever list is showing', () => {
    render(<DebatesHubWorkspace />);

    expect(within(screen.getByTestId('claims-tab-explore')).getAllByRole('button', { name: 'Explore' })).toHaveLength(
      1
    );

    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'Matches' }));

    expect(within(screen.getByTestId('lobby-tab')).getAllByRole('button', { name: 'Matches' })).toHaveLength(1);
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

/**
 * GEO-3298: the address bar is a link to what is on screen, so a copied URL opens the same setup.
 */
describe('keeping the URL in step with the list', () => {
  let store: ReturnType<typeof createStore>;
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createStore();
    replaceState = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    replaceState.mockRestore();
    vi.useRealTimers();
  });

  function renderWorkspace() {
    const ui = () => (
      <Provider store={store}>
        <DebatesHubWorkspace />
      </Provider>
    );
    const view = render(ui());
    return () => view.rerender(ui());
  }

  const settle = () => act(() => vi.advanceTimersByTime(URL_SYNC_DELAY_MS));

  it('writes the list the viewer picks', () => {
    renderWorkspace();

    fireEvent.click(picker('Explore'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));
    settle();

    expect(currentSearch()).toBe('list=positions');
  });

  it('writes search, spaces and topics once they settle, as one replace', () => {
    setUrl('list=explore');
    renderWorkspace();
    replaceState.mockClear();

    act(() => {
      store.set(debatesHubExploreSearchAtom, 'clim');
      store.set(debatesHubExploreSearchAtom, 'climate');
      store.set(debatesHubExploreSpaceIdsAtom, ['space-a', 'space-b']);
      store.set(debatesHubExploreTopicIdsAtom, ['t1']);
    });
    expect(replaceState).not.toHaveBeenCalled();

    settle();

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(new URLSearchParams(currentSearch()))).toEqual({
      q: 'climate',
      spaces: 'space-a,space-b',
      topics: 't1',
    });
  });

  // The link that opened the page is what is on screen, so there is nothing to write.
  it('leaves the link it was opened from as it is', () => {
    setUrl('q=climate&spaces=space-a');
    renderWorkspace();
    replaceState.mockClear();

    settle();

    expect(replaceState).not.toHaveBeenCalled();
    expect(store.get(debatesHubExploreSearchAtom)).toBe('climate');
  });

  it('drops a filter the viewer clears', () => {
    setUrl('list=explore&q=climate');
    const rerender = renderWorkspace();

    act(() => store.set(debatesHubExploreSearchAtom, ''));
    settle();
    rerender();

    expect(currentSearch()).toBe('');
    expect(store.get(debatesHubExploreSearchAtom)).toBe('');
  });

  it('keeps an unfiltered Explore list a bare /matchmaking', () => {
    renderWorkspace();
    settle();

    expect(replaceState).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('');
  });

  // Reading the write back would trim the space off a search the viewer is still typing.
  it('does not read its own write back as a link', () => {
    setUrl('list=explore');
    const rerender = renderWorkspace();

    act(() => store.set(debatesHubExploreSearchAtom, 'nuclear '));
    settle();
    rerender();

    expect(currentSearch()).toBe('q=nuclear');
    expect(store.get(debatesHubExploreSearchAtom)).toBe('nuclear ');
  });

  // Before Privy restores the session the list is the signed-out fallback; writing it would turn a
  // link to My positions into one to Explore.
  it('writes nothing until the session is restored', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    setUrl('list=positions&spaces=space-a');
    renderWorkspace();
    replaceState.mockClear();

    settle();

    expect(replaceState).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('list=positions&spaces=space-a');
  });
});
