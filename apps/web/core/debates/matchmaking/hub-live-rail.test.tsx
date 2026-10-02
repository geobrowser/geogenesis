import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HubLiveRail } from './hub-live-rail';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  ready: true,
  authenticated: true,
  incoming: [] as { id: string; expires_at: string }[],
  outbound: null as { id: string; expires_at: string } | null,
  challenge: null as { id: string; status: string; expires_at: string } | null,
  requestsHasContent: false,
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
  useDebateActivity: () => ({
    data: { outbound_request: null, challenge: mocks.challenge },
  }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({ data: { incoming: mocks.incoming, outbound: mocks.outbound } }),
}));

// The real one starts a server clock; this suite is about which sections render, not expiry.
vi.mock('./use-request-countdown', () => ({
  useUnexpiredRequests: (requests: unknown[]) => requests,
}));

// Both lists are the panel's own and have their own suites; this one is about which of them the
// rail shows, in what order, and what stands in for the one that needs an account.
// `RequestsTab` decides for itself whether it has anything to show, and renders nothing when it doesn't.
vi.mock('./requests-tab', () => ({
  RequestsTab: () => (mocks.requestsHasContent ? <div data-testid="requests-tab" /> : null),
}));
vi.mock('./people-tab', () => ({ PeopleTab: () => <div data-testid="people-tab" /> }));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.promptSignIn.mockReset();
  mocks.incoming = [];
  mocks.outbound = null;
  mocks.challenge = null;
  mocks.requestsHasContent = false;
});

afterEach(cleanup);

describe('HubLiveRail', () => {
  // Ordered by urgency: a request expires in ~25 minutes, where presence is the slower of the two.
  it('stacks requests, then who is available', () => {
    // The order is only observable while Requests is drawing something.
    mocks.requestsHasContent = true;
    render(<HubLiveRail />);

    const rendered = ['requests-tab', 'people-tab'].map(id => screen.getByTestId(id));
    for (const [index, node] of rendered.slice(0, -1).entries()) {
      const next = rendered[index + 1];
      expect(Boolean(node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }
  });

  // Mounted whatever it holds. The rail used to gate this itself, re-deriving "is anything pending"
  // from incoming requests.
  it('always mounts Requests when signed in, and lets it decide whether to draw', () => {
    mocks.requestsHasContent = true;
    render(<HubLiveRail />);
    expect(screen.getByTestId('requests-tab')).toBeInTheDocument();
  });

  it('leaves People at the top when Requests draws nothing', () => {
    mocks.requestsHasContent = false;
    render(<HubLiveRail />);

    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();

    expect(screen.getByTestId('people-tab')).toBeInTheDocument();
  });

  // Its sections name themselves ("Upcoming debates", "Sent", "Received"), so a "Requests" heading
  // above them only said the same thing twice.
  it('heads the people list "People" and draws no Requests heading of its own', () => {
    mocks.requestsHasContent = true;
    render(<HubLiveRail />);

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByText('Available now')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Requests' })).not.toBeInTheDocument();
  });

  // Signed out the rail loses two of its three lists. Two empty headings would say nothing, so it
  // keeps the one that still answers and explains the two that need an account.
  it('keeps People signed out and explains what the account-gated one would offer', () => {
    mocks.authenticated = false;
    render(<HubLiveRail />);

    expect(screen.getByTestId('people-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();
    expect(screen.getByText(/debate requests sent to you/)).toBeInTheDocument();
  });

  it('routes the signed-out prompt into Privy', () => {
    mocks.authenticated = false;
    render(<HubLiveRail />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(mocks.promptSignIn).toHaveBeenCalled();
  });

  // `authenticated` is false while Privy restores, so drawing before then would show a returning
  // viewer the signed-out rail and then swap their requests in a beat later.
  it('draws nothing until Privy has resolved', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    render(<HubLiveRail />);

    expect(screen.queryByTestId('people-tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/paired with someone who disagrees/)).not.toBeInTheDocument();
  });
});
