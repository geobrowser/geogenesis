import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { DebatesHubPanel } from './debates-hub-panel';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  ready: true,
  authenticated: true,
  available: false,
  updateAvailability: vi.fn(),
  peopleError: null as unknown,
  people: [] as unknown[],
  pathname: '/space/space-1/claims',
  isMobile: false,
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => mocks.isMobile }));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
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
  useClaimReadiness: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

function renderOpen(tab: 'requests' | 'matches' | 'claims' | 'people' = 'requests') {
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
  mocks.available = false;
  mocks.people = [];
  mocks.peopleError = null;
  mocks.updateAvailability.mockReset();
  mocks.pathname = '/space/space-1/claims';
  mocks.isMobile = false;
});

afterEach(cleanup);

describe('DebatesHubPanel', () => {
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

    for (const label of ['Requests', 'Matches', 'Claims', 'People']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }

    // jsdom has no layout, so reachability at a narrow width can't be asserted directly. The
    // scroll container is the thing that guarantees it, so pin that instead — without it the
    // last tab is clipped by the panel's `overflow-hidden` with no way to get to it.
    const row = screen.getByRole('button', { name: /^Claims/ }).closest('.overflow-x-auto');
    expect(row).not.toBeNull();

    // Order, not just presence: the labels alone stayed green through a reorder.
    const order = ['Claims', 'People', 'Matches', 'Requests'];
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

  // GEO-2725. The hub used to be one sign-in message end to end. Claims and People describe the
  // corpus rather than the viewer, so both are readable signed out and are what the row offers.
  it('offers Claims and People to anonymous visitors, and shows the Claims list', () => {
    mocks.authenticated = false;
    renderOpen();

    expect(screen.getByRole('button', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to find people to debate.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-current', 'true');
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
    renderOpen('matches');

    // `aria-hidden` takes the row out of the accessibility tree, so it is not reachable at all —
    // which is the point: nothing is announced or focusable until we know which row it should be.
    expect(screen.queryByRole('button', { name: 'Claims' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claims', hidden: true })).toBeInTheDocument();
  });

  it('shows the tab row once Privy has resolved', () => {
    renderOpen('matches');

    expect(screen.getByRole('button', { name: 'Claims' })).toBeInTheDocument();
  });

  // Signing out with Matches open would otherwise leave a tab body showing with no tab selected.
  it('falls back to Claims when signed out on a tab that is no longer offered', () => {
    mocks.authenticated = false;
    renderOpen('matches');

    expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-current', 'true');
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

  // GEO-2726. Without this the full-screen hub is reachable only by knowing the URL, and the panel
  // is where everyone already is. Filters ride across on their own — both layouts read the same
  // atom — so the link carries no state of its own.
  it('offers a way out to the full-screen hub, and closes the panel on the way', () => {
    const store = renderOpen();

    const expand = screen.getByRole('link', { name: 'Open full screen' });
    expect(expand).toHaveAttribute('href', '/matchmaking');

    fireEvent.click(expand);

    expect(store.get(debatesHubAtom)).toBeNull();
  });
});

// Accepting a request from the Requests tab now walks the viewer into the debate room; the panel
// would otherwise stay mounted on top of it, covering the pre-screen.
it('closes itself once a navigation lands', () => {
  const store = renderOpen('requests');
  expect(screen.getByRole('button', { name: /^Requests/ })).toBeInTheDocument();

  mocks.pathname = '/space/space-1/debates/debate-1';
  store.rerender();

  expect(store.get(debatesHubAtom)).toBeNull();

});
