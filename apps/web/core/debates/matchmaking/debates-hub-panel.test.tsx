import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { DebatesHubPanel } from './debates-hub-panel';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
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
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, accountKey: 'user-a' }),
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

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
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

  it('asks anonymous visitors to sign in', () => {
    mocks.authenticated = false;
    renderOpen();

    expect(screen.getByText('Sign in to find people to debate.')).toBeInTheDocument();
  });

  // `aria-modal` on the sheet hides the navbar toggle and the backdrop from assistive tech, so
  // without this the only way out is Escape — a key phones don't have.
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

// Accepting a request from the Requests tab now walks the viewer into the debate room; the panel
// would otherwise stay mounted on top of it, covering the pre-screen.
it('closes itself once a navigation lands', () => {
  const store = renderOpen('requests');
  expect(screen.getByRole('button', { name: /^Requests/ })).toBeInTheDocument();

  mocks.pathname = '/space/space-1/debates/debate-1';
  store.rerender();

  expect(store.get(debatesHubAtom)).toBeNull();
});
