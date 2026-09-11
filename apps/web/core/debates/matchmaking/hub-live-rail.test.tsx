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

// Requests and People are the panel's own and have their own suites; this one is about which of
// them the rail shows, in what order, and what stands in when an account is required. Matches is a
// Claims scope on this surface, not a rail section.
vi.mock('./requests-tab', () => ({ RequestsTab: () => <div data-testid="requests-tab" /> }));
vi.mock('./people-tab', () => ({ PeopleTab: () => <div data-testid="people-tab" /> }));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.promptSignIn.mockReset();
  mocks.incoming = [];
  mocks.outbound = null;
  mocks.challenge = null;
});

afterEach(cleanup);

describe('HubLiveRail', () => {
  // Ordered by urgency: a request expires in ~25 minutes; presence is slower.
  it('stacks requests, then who is available, once a request is pending', () => {
    mocks.incoming = [{ id: 'request-1', expires_at: '2099-01-01T00:00:00.000Z' }];
    render(<HubLiveRail />);

    const rendered = ['requests-tab', 'people-tab'].map(id => screen.getByTestId(id));
    for (const [index, node] of rendered.slice(0, -1).entries()) {
      const next = rendered[index + 1];
      expect(Boolean(node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }
  });

  it('leaves Requests out entirely when nothing is pending, so People sits at the top', () => {
    render(<HubLiveRail />);

    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Requests')).not.toBeInTheDocument();
    expect(screen.getByTestId('people-tab')).toBeInTheDocument();
  });

  // Also open for a pending challenge — RequestsTab shows those too.
  it('keeps Requests open for a pending challenge with no claim requests', () => {
    mocks.challenge = { id: 'challenge-1', status: 'pending', expires_at: '2099-01-01T00:00:00.000Z' };
    render(<HubLiveRail />);

    expect(screen.getByTestId('requests-tab')).toBeInTheDocument();
  });

  it('does not hold Requests open for a challenge that is no longer pending', () => {
    mocks.challenge = { id: 'challenge-1', status: 'accepted', expires_at: '2099-01-01T00:00:00.000Z' };
    render(<HubLiveRail />);

    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();
  });

  it('shows Requests for a sent one as well as a received one', () => {
    mocks.outbound = { id: 'request-1', expires_at: '2099-01-01T00:00:00.000Z' };
    render(<HubLiveRail />);

    expect(screen.getByTestId('requests-tab')).toBeInTheDocument();
  });

  // Signed out the rail loses Requests. An empty heading would say nothing, so it keeps People and
  // explains that list instead. Matches is a Claims scope on the left, not a rail section.
  it('keeps People signed out and explains Requests', () => {
    mocks.authenticated = false;
    render(<HubLiveRail />);

    expect(screen.getByTestId('people-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Requests' })).toBeInTheDocument();
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
    expect(screen.queryByText(/debate requests sent to you/)).not.toBeInTheDocument();
  });
});
