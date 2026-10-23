import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaimSummary } from '../api';
import { claimPickKey } from './calendar-narrowing';
import { HubClaimEndSlot } from './hub-claim-end-slot';
import type { OutgoingAsk } from './use-outgoing-ask';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  match: null as null | { viewer_position: boolean; viewer_response?: { position: boolean } | null },
  blockedReason: undefined as string | undefined,
  request: vi.fn(),
}));

vi.mock('~/core/claims/browse/use-claim-matchup', () => ({
  useClaimMatchup: () => ({
    match: mocks.match,
    blockedReason: mocks.blockedReason,
    isRequesting: false,
    requestError: null,
    request: mocks.request,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams('modal=debates&sort=new'),
}));

// The countdown reads the server's clock, which is three round trips in a real session.
vi.mock('./use-request-countdown', async importOriginal => ({
  ...(await importOriginal<typeof import('./use-request-countdown')>()),
  useServerClock: () => null,
}));

const CLAIM: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: '25omwWh6HYgeRQKCaSpVpa',
  claim_entity_id: '4f1d7c6b2a8e4e7f9c3b5a1d2e6f8a90',
  claim: 'Cities should build more housing',
  description: null,
};

const otherAsk: OutgoingAsk = {
  kind: 'claim',
  id: 'request-2',
  claim: { ...CLAIM, claim_entity_id: '0f1d7c6b2a8e4e7f9c3b5a1d2e6f8a90', claim: 'Another claim' },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function renderSlot(props: Partial<React.ComponentProps<typeof HubClaimEndSlot>> = {}) {
  const store = createStore();
  store.set(debatesHubAtom, { tab: 'explore' });
  const view = render(
    <JotaiProvider store={store}>
      <HubClaimEndSlot claim={CLAIM} ask={null} viewerPosition={true} {...props} />
    </JotaiProvider>
  );
  return { ...view, store };
}

beforeEach(() => {
  mocks.match = { viewer_position: true };
  mocks.blockedReason = undefined;
  mocks.request.mockReset();
});

afterEach(cleanup);

describe('HubClaimEndSlot', () => {
  it('offers Debate now with a small Schedule link when someone on the other side is online', () => {
    renderSlot();

    fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Schedule a debate on/ })).toHaveTextContent('Schedule');
  });

  it('links Schedule to the calendar narrowed to this claim and the other side, from this page', () => {
    renderSlot();

    const href = screen.getByRole('link', { name: /Schedule a debate on/ }).getAttribute('href')!;
    const url = new URL(href, 'https://geo.test');
    expect(url.pathname).toBe('/matchmaking/calendar');
    expect(url.searchParams.get('claims')).toBe(claimPickKey(CLAIM.space_id, CLAIM.claim_entity_id));
    expect(url.searchParams.get('matches')).toBe('1');
    // The panel's own trigger is dropped, so Back from the calendar does not reopen it on top.
    expect(url.searchParams.get('from')).toBe('/explore?sort=new');
  });

  it('closes the panel on the way to the calendar', () => {
    const { store } = renderSlot({ someoneOnline: false });

    fireEvent.click(screen.getByRole('link', { name: /Schedule a debate on/ }));
    expect(store.get(debatesHubAtom)).toBeNull();
  });

  it('makes Schedule the main action when nobody on the other side is online', () => {
    mocks.match = null;
    renderSlot();

    expect(screen.queryByRole('button', { name: 'Debate now' })).toBeNull();
    expect(screen.getByRole('link', { name: /Schedule a debate on/ })).toBeInTheDocument();
  });

  it('shows Schedule instead of Debate now for a match Matches says is offline only', () => {
    renderSlot({ someoneOnline: false, viewerPosition: undefined });

    expect(screen.queryByRole('button', { name: 'Debate now' })).toBeNull();
    expect(screen.getByRole('link', { name: /Schedule a debate on/ })).toBeInTheDocument();
  });

  it('offers nothing on a claim the viewer has not taken a side on and nobody is matched', () => {
    mocks.match = null;
    renderSlot({ viewerPosition: null });

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('counts the real expiry down on the card whose request is out', () => {
    renderSlot({
      ask: { ...otherAsk, claim: CLAIM, expiresAt: new Date(Date.now() + 90_000).toISOString() },
    });

    expect(screen.getByRole('timer')).toHaveTextContent(/^Requesting · 1:(30|29)$/);
    expect(screen.queryByRole('button', { name: 'Debate now' })).toBeNull();
    expect(screen.queryByText(/Asking/)).toBeNull();
  });

  it('pauses Debate now on every other card while a request is out', () => {
    renderSlot({ ask: otherAsk });

    const button = screen.getByRole('button', { name: 'Debate now' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Schedule a debate on/ })).toBeNull();
  });

  it('withdraws the offer when the match was made for the side the viewer has left', () => {
    renderSlot({ viewerPosition: false });

    expect(screen.queryByRole('button', { name: 'Debate now' })).toBeNull();
    // They still hold a side, so scheduling with the people now opposite them is on offer.
    expect(screen.getByRole('link', { name: /Schedule a debate on/ })).toBeInTheDocument();
  });
});
