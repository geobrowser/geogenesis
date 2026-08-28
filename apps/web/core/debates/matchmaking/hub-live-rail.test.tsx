import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HubLiveRail } from './hub-live-rail';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  ready: true,
  authenticated: true,
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

// The three lists are the panel's own and have their own suites; this one is about which of them
// the rail shows, in what order, and what stands in for the two that need an account.
vi.mock('./requests-tab', () => ({ RequestsTab: () => <div data-testid="requests-tab" /> }));
vi.mock('./matches-tab', () => ({ MatchesTab: () => <div data-testid="matches-tab" /> }));
vi.mock('./people-tab', () => ({ PeopleTab: () => <div data-testid="people-tab" /> }));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.promptSignIn.mockReset();
});

afterEach(cleanup);

describe('HubLiveRail', () => {
  // Ordered by urgency rather than by the tab order it inherits: a request expires in ~25 minutes,
  // matches are pairable now, presence is the slowest of the three.
  it('stacks requests, then matches, then who is available', () => {
    const { container } = render(<HubLiveRail />);

    const rendered = ['requests-tab', 'matches-tab', 'people-tab'].map(id => screen.getByTestId(id));
    for (const [index, node] of rendered.slice(0, -1).entries()) {
      const next = rendered[index + 1];
      expect(Boolean(node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }
    expect(container).toBeTruthy();
  });

  // Signed out the rail loses two of its three lists. Two empty headings would say nothing, so it
  // keeps the one that still answers and explains the two that need an account.
  it('keeps People signed out and explains what the other two would offer', () => {
    mocks.authenticated = false;
    render(<HubLiveRail />);

    expect(screen.getByTestId('people-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('requests-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matches-tab')).not.toBeInTheDocument();
    expect(screen.getByText(/paired with someone who disagrees/)).toBeInTheDocument();
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
