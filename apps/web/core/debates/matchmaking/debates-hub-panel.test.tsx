import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { type PrimitiveAtom, Provider, createStore, useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { DEBATES_MODAL } from '../debates-panel-deep-link';
import { DebatesHubPanel } from './debates-hub-panel';
import {
  type DebatesHubTab,
  debatesHubAtom,
  debatesHubExploreFilterAtom,
  debatesHubExploreSearchAtom,
  debatesHubExploreSpaceIdsAtom,
  debatesHubExploreSpaceSeedSpentAtom,
  debatesHubExploreTopicIdsAtom,
  debatesHubLobbySearchAtom,
  debatesHubLobbySpaceIdsAtom,
  debatesHubLobbySpaceSeedSpentAtom,
  debatesHubLobbyTopicIdsAtom,
} from '~/atoms';
import * as atomsModule from '~/atoms';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  ready: true,
  authenticated: true,
  accountKey: 'user-a' as string | null,
  available: false,
  updateAvailability: vi.fn(),
  peopleError: null as unknown,
  people: [] as unknown[],
  pathname: '/space/space-1/claims',
  searchParams: new URLSearchParams(),
  isMobile: false,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => mocks.isMobile }));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: mocks.accountKey }),
  useDebateActivity: () => ({ data: { available_to_debate: mocks.available, incoming_request_count: 0 } }),
  useUpdateDebateAvailability: () => ({ mutate: mocks.updateAvailability, isPending: false }),
  useCreateDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRejectDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('./hooks', () => ({
  useMatchmakingScope: () => true,
  useDebateRequests: () => ({ data: { outbound: null, incoming: [] }, isLoading: false, error: null }),
  useDebatePeople: () => ({
    data: mocks.peopleError ? undefined : { people: mocks.people },
    isLoading: false,
    error: mocks.peopleError,
  }),
  useMatchmakingClaims: () => ({ data: undefined, isLoading: false, error: null, hasNextPage: false }),
  useMatchmakingMatches: () => ({ data: { matches: [] }, isLoading: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useWithdrawDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useAcceptDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDismissDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useBlockDebateUser: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

// This suite is about the tab row and which body it selects, not the Claims list itself — which
// reaches for the space allowlist and the knowledge graph through react-query. `HubStickyControls`
// stays real because the People tab renders it.
vi.mock('./claims-tab', async () => {
  const actual = await vi.importActual<typeof import('./claims-tab')>('./claims-tab');
  return { ...actual, ClaimsTab: () => <div data-testid="claims-tab" /> };
});

// `usePrivySignIn` reaches for Privy's context, which these suites do not stand up. The signed-out
// paths assert that it is *called*, so the stub is shared through `mocks.promptSignIn`.
// PeopleTab fetches every listed person's record through react-query; this panel test renders
// without a client and is about tab switching, not the rows.
vi.mock('./use-person-records', () => ({
  usePersonRecords: () => new Map(),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

function renderOpen(tab: DebatesHubTab = 'requests') {
  const store = createStore();
  store.set(debatesHubAtom, { tab });
  const view = render(
    <Provider store={store}>
      <DebatesHubPanel />
    </Provider>
  );
  return Object.assign(store, {
    rerender: () =>
      view.rerender(
        <Provider store={store}>
          <DebatesHubPanel />
        </Provider>
      ),
  });
}

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.accountKey = 'user-a';
  mocks.available = false;
  mocks.people = [];
  mocks.peopleError = null;
  mocks.updateAvailability.mockReset();
  mocks.pathname = '/space/space-1/claims';
  mocks.searchParams = new URLSearchParams();
  mocks.isMobile = false;
});

afterEach(cleanup);

/**
 * Every atom the filter bar holds, paired with a value that is not its default.
 *
 * Must match `resetDebatesHubFiltersAtom` exactly — the test below this one holds it to that
 * against the module's exports, because the hand-kept version fell behind once already.
 */
const FILTER_ATOMS = [
  { name: 'debatesHubExploreFilterAtom', atom: debatesHubExploreFilterAtom, dirty: 'featured', cleared: 'all' },
  { name: 'debatesHubExploreSpaceIdsAtom', atom: debatesHubExploreSpaceIdsAtom, dirty: ['space-a'], cleared: [] },
  { name: 'debatesHubExploreTopicIdsAtom', atom: debatesHubExploreTopicIdsAtom, dirty: ['topic-a'], cleared: [] },
  { name: 'debatesHubExploreSearchAtom', atom: debatesHubExploreSearchAtom, dirty: 'nuclear', cleared: '' },
  {
    name: 'debatesHubExploreSpaceSeedSpentAtom',
    atom: debatesHubExploreSpaceSeedSpentAtom,
    dirty: true,
    cleared: false,
  },
  { name: 'debatesHubLobbySpaceIdsAtom', atom: debatesHubLobbySpaceIdsAtom, dirty: ['space-a'], cleared: [] },
  { name: 'debatesHubLobbyTopicIdsAtom', atom: debatesHubLobbyTopicIdsAtom, dirty: ['topic-a'], cleared: [] },
  { name: 'debatesHubLobbySearchAtom', atom: debatesHubLobbySearchAtom, dirty: 'nuclear', cleared: '' },
  { name: 'debatesHubLobbySpaceSeedSpentAtom', atom: debatesHubLobbySpaceSeedSpentAtom, dirty: true, cleared: false },
] as const;

describe('DebatesHubPanel', () => {
  // GEO-2850. The filter bar is session state now, and a session outlives a sign-in. A spent seed
  // carried across one would keep GEO-2834's brand-new-account default from ever landing, and a
  // carried selection would show one viewer the spaces another had picked.
  //
  // Every atom the bar holds, not a sample of them: this is the isolation test, so an atom left out
  // of `resetDebatesHubFiltersAtom` has to fail here rather than quietly hand B one of A's filters.
  // GEO-2861. Four tabs, and "My positions" is not one of them: it is a source inside Explore's
  // menu, one more answer to "which claims?" rather than a surface of its own.
  it('offers Lobby, People, Explore and Requests, in that order', () => {
    renderOpen('explore');

    const order = ['Lobby', 'People', 'Explore', 'Requests'];
    const row = screen.getByRole('button', { name: /^Lobby/ }).closest('.overflow-x-auto');
    const labels = [...(row?.querySelectorAll('button') ?? [])].map(button => button.textContent?.trim());

    expect(labels).toEqual(order);
    expect(screen.queryByRole('button', { name: 'My claims' })).not.toBeInTheDocument();
  });

  it('clears the filter bar when the account behind it changes', () => {
    const store = renderOpen('explore');
    for (const { atom, dirty } of FILTER_ATOMS) store.set(atom as PrimitiveAtom<unknown>, dirty);

    mocks.accountKey = 'user-b';
    store.rerender();

    for (const { name, atom, cleared } of FILTER_ATOMS) {
      expect({ [name]: store.get(atom as PrimitiveAtom<unknown>) }).toEqual({ [name]: cleared });
    }
  });

  /**
   * The guard on the list above, which is the only thing standing between a new filter atom and one
   * account's search or selection reaching another's.
   *
   * The list was hand-kept and fell behind exactly once: the search atoms were added to
   * `resetDebatesHubFiltersAtom` and not here, so dropping either reset would have stayed green.
   * Matching it against the module's own exports is what makes "every atom, not a sample" true by
   * construction rather than by remembering.
   *
   * `debatesHubMatchesOnlyAtom` is deliberately outside the pattern and outside the reset: it is a
   * stored preference about how you like to arrive at a debate, not working state, and handing a
   * new account the previous one's *preference* is what every other stored setting here does.
   */
  it('covers every Explore and Lobby filter atom', () => {
    const exported = Object.keys(atomsModule).filter(name => /^debatesHub(Explore|Lobby).*Atom$/.test(name));

    expect(new Set(exported)).toEqual(new Set(FILTER_ATOMS.map(entry => entry.name)));
  });

  // Signing in is the same person authenticating. The Claims tab prompts for sign-in from inside
  // its own empty state, so wiping the bar here would lose picks made seconds earlier on the flow
  // the tab itself invited — the very complaint GEO-2850 is about.
  it('keeps the filter bar when a signed-out viewer signs in', () => {
    mocks.accountKey = null;
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);
    store.set(debatesHubExploreFilterAtom, 'all');

    mocks.accountKey = 'user-a';
    store.rerender();

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual(['space-a']);
    expect(store.get(debatesHubExploreFilterAtom)).toBe('all');
  });

  // Signed out there are no memberships for the seed to apply to, so it is never spent by seeding
  // — only by working the menu. An untouched session therefore arrives at sign-in still armed, and
  // the default GEO-2834 is about lands on its own. Nothing here has to re-arm it.
  it('leaves the membership seed armed through an untouched sign-in', () => {
    mocks.accountKey = null;
    const store = renderOpen('explore');

    mocks.accountKey = 'user-a';
    store.rerender();

    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(false);
  });

  // A spent seed means the viewer worked the menu, and forcing it back would overwrite what they
  // did — whether they picked spaces...
  it('leaves the seed spent on sign-in when the viewer has picked spaces', () => {
    mocks.accountKey = null;
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceSeedSpentAtom, true);
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);

    mocks.accountKey = 'user-a';
    store.rerender();

    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(true);
  });

  // ...or deliberately cleared them, which is indistinguishable from an untouched filter by the
  // selection alone. GEO-2789 is explicit that an empty selection the viewer asked for means the
  // unfiltered list, and is not an invitation to fill it back in for them.
  it('leaves the seed spent on sign-in when the viewer cleared the filter themselves', () => {
    mocks.accountKey = null;
    const store = renderOpen('explore');
    // What pick-then-clear leaves behind: nothing selected, but the seed forfeited.
    store.set(debatesHubExploreSpaceSeedSpentAtom, true);
    store.set(debatesHubExploreSpaceIdsAtom, []);

    mocks.accountKey = 'user-a';
    store.rerender();

    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(true);
    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual([]);
  });

  // Signing out must not forget who the state belongs to, or the next viewer to sign in would look
  // like a first sign-in and inherit it.
  it('still clears for a different account that signs in after a sign-out', () => {
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);

    mocks.accountKey = null;
    store.rerender();
    mocks.accountKey = 'user-b';
    store.rerender();

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual([]);
  });

  // The reset is a passive effect, so the render that first sees a different account still holds
  // the previous one's bar. Showing the tabs then would put A's filter labels in front of B and
  // fire B's first query with A's space ids.
  it('does not render a tab holding the previous account’s filters', () => {
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);
    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();

    mocks.accountKey = 'user-b';
    store.rerender();

    // Cleared and back on screen in the same commit the handover lands, so nothing of A's is shown.
    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual([]);
    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
  });

  // The same viewer reopening the panel must keep what they picked, which is the whole feature.
  it('leaves the filter bar alone for the same account', () => {
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);

    store.rerender();

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual(['space-a']);
  });

  // `accountKey` is null until Privy resolves. Treating that as "signed out" would clear a
  // signed-in viewer's filters on every reopen.
  it('does not clear the filter bar while auth is still resolving', () => {
    mocks.ready = false;
    mocks.accountKey = null;
    const store = renderOpen('explore');
    store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);

    store.rerender();

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual(['space-a']);
  });

  it('stays closed until the hub atom is set', () => {
    render(
      <Provider store={createStore()}>
        <DebatesHubPanel />
      </Provider>
    );

    expect(screen.queryByRole('heading', { name: 'Debates' })).not.toBeInTheDocument();
  });

  it('renders every tab and switches between them', async () => {
    renderOpen();

    for (const label of ['Requests', 'Lobby', 'Explore', 'People']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }

    // jsdom has no layout, so reachability at a narrow width can't be asserted directly. The
    // scroll container is the thing that guarantees it, so pin that instead — without it the
    // last tab is clipped by the panel's `overflow-hidden` with no way to get to it.
    const row = screen.getByRole('button', { name: /^Lobby/ }).closest('.overflow-x-auto');
    expect(row).not.toBeNull();

    // Order, not just presence: the labels alone stayed green through a reorder.
    const order = ['Lobby', 'People', 'Explore', 'Requests'];
    const rendered = order.map(label => screen.getByRole('button', { name: new RegExp(`^${label}`) }));
    for (const [index, tab] of rendered.slice(0, -1).entries()) {
      const next = rendered[index + 1];
      expect(Boolean(tab.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }

    fireEvent.click(screen.getByRole('button', { name: /^People/ }));

    // Tab bodies cross-fade, so the incoming panel arrives after the outgoing one finishes.
    expect(await screen.findByText('Nobody is available to debate right now.')).toBeInTheDocument();
  });

  it('toggles availability from the panel header', () => {
    renderOpen();

    fireEvent.click(screen.getByRole('switch', { name: 'Available to debate' }));

    expect(mocks.updateAvailability).toHaveBeenCalledWith(true);
  });

  it('explains that matchmaking is not deployed yet when the endpoint 404s', () => {
    mocks.peopleError = new GeoChatRequestError('Not found', null, 404);
    renderOpen('people');

    expect(screen.getByText("Matchmaking isn't available yet.")).toBeInTheDocument();
  });

  // GEO-2725. The hub used to be one sign-in message end to end. Explore and People describe the
  // corpus rather than the viewer, so both are readable signed out and are what the row offers.
  it('offers Explore and People to anonymous visitors, and shows the Explore list', () => {
    mocks.authenticated = false;
    renderOpen();

    // Explore leads: it is the one the panel opens on, and a row that led with the tab you are not
    // on was `SIGNED_OUT_TABS` naming the contents while `TABS` quietly decided the order.
    const row = screen.getByRole('button', { name: 'Explore' }).closest('.overflow-x-auto');
    const labels = [...(row?.querySelectorAll('button') ?? [])].map(button => button.textContent?.trim());
    expect(labels).toEqual(['Explore', 'People']);

    expect(screen.getByRole('button', { name: 'Explore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to find people to debate.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('claims-tab')).toBeInTheDocument();
  });

  // Matches and Requests are a particular person's, so signed out they have no possible contents.
  it('leaves Matches and Requests out of the row when signed out', () => {
    mocks.authenticated = false;
    renderOpen();

    expect(screen.queryByRole('button', { name: /Matches/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Requests/ })).not.toBeInTheDocument();
  });

  // `authenticated` is false while Privy restores, so a row drawn before then is the signed-out
  // one — a returning viewer would watch Matches and Requests appear and their selected tab jump.
  it('hides the tab row until Privy has resolved, rather than drawing the signed-out one', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    renderOpen('lobby');

    // `aria-hidden` takes the row out of the accessibility tree, so it is not reachable at all —
    // which is the point: nothing is announced or focusable until we know which row it should be.
    expect(screen.queryByRole('button', { name: 'Explore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore', hidden: true })).toBeInTheDocument();
  });

  it('shows the tab row once Privy has resolved', () => {
    renderOpen('lobby');

    expect(screen.getByRole('button', { name: 'Explore' })).toBeInTheDocument();
  });

  // Signing out with Matches open would otherwise leave a tab body showing with no tab selected.
  it('falls back to Explore when signed out on a tab that is no longer offered', () => {
    mocks.authenticated = false;
    renderOpen('lobby');

    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('button', { name: /Matches/ })).not.toBeInTheDocument();
  });

  // `aria-modal` on the sheet hides the navbar toggle and the backdrop from assistive tech, so
  // without this the only way out is Escape — a key phones don't have.
  // The panel's only dismissal on desktop, and the one thing the opener exemption must not cost.
  it('closes when a pointer goes down outside it', () => {
    const store = renderOpen();
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    fireEvent.pointerDown(outside);

    expect(store.get(debatesHubAtom)).toBeNull();
    outside.remove();
  });

  // The navbar's button and the browse feed's "Join a debate" both carry this marker so their own
  // click can toggle the panel. Without the exemption the pointerdown closed it and the click
  // reopened it, which read as a flicker.
  it('stays open when the pointer goes down on something marked as an opener', () => {
    const store = renderOpen();
    const opener = document.createElement('button');
    opener.setAttribute('data-debates-hub-opener', '');
    document.body.appendChild(opener);

    fireEvent.pointerDown(opener);

    expect(store.get(debatesHubAtom)).not.toBeNull();
    opener.remove();
  });

  it('gives the mobile sheet a close button that assistive tech can reach', () => {
    mocks.isMobile = true;
    const store = renderOpen();

    fireEvent.click(screen.getByRole('button', { name: 'Close debates' }));

    expect(store.get(debatesHubAtom)).toBeNull();
  });

  // The desktop aside is not modal: its navbar toggle stays reachable, and the design's header is
  // the title and the availability switch, nothing else.
  it('leaves the desktop panel header alone', () => {
    renderOpen();

    expect(screen.queryByRole('button', { name: 'Close debates' })).not.toBeInTheDocument();
  });
});

// Accepting a request from the Requests tab walks the viewer into the debate room; the panel would
// otherwise stay mounted on top of it, covering the pre-screen. This is the one navigation that
// still closes it, and the reason the effect exists at all.
it('closes itself on the way into a debate room', () => {
  const store = renderOpen('requests');
  expect(screen.getByRole('button', { name: /^Requests/ })).toBeInTheDocument();

  mocks.pathname = '/space/space-1/debates/debate-1';
  store.rerender();

  expect(store.get(debatesHubAtom)).toBeNull();
});

// GEO-2788. Following a claim out of the Claims tab, or a person out of the People tab, used to
// shut the list the viewer was working through — so coming back meant reopening the hub, finding
// the tab and finding their place again. The hub follows them instead.
it.each([
  ['a claim or entity page', '/space/space-1/entity-1'],
  ["a person's space", '/space/person-space-1'],
  ['the debates feed', '/space/space-1/debates'],
])('stays open when the viewer navigates to %s', (_label, pathname) => {
  const store = renderOpen('explore');

  mocks.pathname = pathname;
  store.rerender();

  expect(store.get(debatesHubAtom)).toEqual({ tab: 'explore' });
});

// Desktop only. On mobile the hub is a full-screen `aria-modal` sheet over a backdrop, so staying
// open would navigate the page behind an opaque overlay — the tap would appear to do nothing, and
// the destination would be hidden from assistive tech until the sheet was dismissed by hand.
it('closes on any navigation on mobile, where it covers the destination', () => {
  mocks.isMobile = true;
  const store = renderOpen('explore');

  mocks.pathname = '/space/space-1/entity-1';
  store.rerender();

  expect(store.get(debatesHubAtom)).toBeNull();
});

// A link that explicitly asks for the hub still wins, on either layout.
it('stays open on mobile when the destination itself asks for the hub', () => {
  mocks.isMobile = true;
  mocks.searchParams = new URLSearchParams(`modal=${DEBATES_MODAL}`);
  const store = renderOpen('explore');

  mocks.pathname = '/space/space-1/entity-1';
  store.rerender();

  expect(store.get(debatesHubAtom)).toEqual({ tab: 'explore' });
});

// `?modal=debates` reached by client-side navigation opens the hub from the same commit that
// changes the pathname. The close-on-navigation effect above must not undo that — from either
// starting state, and without depending on `DeepLinkHandler` being mounted after this panel in
// `app/entry.tsx`. The already-open case is the one `isOpen` alone cannot save: the close fires,
// so only the destination's own params can tell this navigation apart from leaving the hub.
it.each<[string, { tab: DebatesHubTab } | null]>([
  ['shut', null],
  ['already open on another tab', { tab: 'people' }],
])('stays open when a cross-route deep link arrives with the hub %s', (_state, initial) => {
  const store = createStore();
  store.set(debatesHubAtom, initial);
  const DEEP_LINK_PATH = '/explore';

  // `DeepLinkHandler` reduced to what matters here: an effect that opens the hub on arrival,
  // mounted before the panel exactly as `app/entry.tsx` renders the two.
  function OpensHubOnArrival() {
    const pathname = usePathname();
    const setHub = useSetAtom(debatesHubAtom);
    React.useEffect(() => {
      if (pathname !== DEEP_LINK_PATH) return;
      setHub({ tab: 'explore' });
    }, [pathname, setHub]);
    return null;
  }

  const tree = () => (
    <Provider store={store}>
      <OpensHubOnArrival />
      <DebatesHubPanel />
    </Provider>
  );

  mocks.pathname = '/space/space-1/claims';
  const view = render(tree());

  mocks.pathname = DEEP_LINK_PATH;
  mocks.searchParams = new URLSearchParams({ modal: 'debates' });
  view.rerender(tree());

  expect(store.get(debatesHubAtom)).toEqual({ tab: 'explore' });
});
