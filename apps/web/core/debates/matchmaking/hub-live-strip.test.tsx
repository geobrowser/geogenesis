import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import type { EndedAsk, OutgoingAsk } from './use-outgoing-ask';

const mocks = vi.hoisted(() => ({
  ask: null as OutgoingAsk | null,
  ended: null as EndedAsk | null,
  cancel: vi.fn(),
  dismissEnded: vi.fn(),
  close: vi.fn(),
  auth: { ready: true, authenticated: true },
  signIn: vi.fn(),
  queue: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('./hub-ask-context', () => ({
  useHubAskState: () => ({
    ask: mocks.ask,
    ended: mocks.ended,
    cancel: mocks.cancel,
    cancelling: false,
    dismissEnded: mocks.dismissEnded,
  }),
}));
vi.mock('./use-outgoing-ask', () => ({
  useAskClock: () => ({ remainingMs: 72_000, label: '1:12' }),
}));
vi.mock('./use-debates-hub', () => ({ useDebatesHub: () => ({ close: mocks.close }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => mocks.auth,
}));
// The press itself is real, so a signed-out RSVP is seen going through sign-in; what it calls is not.
vi.mock('../lobbies/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../lobbies/hooks')>()),
  useDebateLobbies: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, mutateAsync: vi.fn(), isPending: false }),
  useLobbyReminderSaving: () => false,
  useLobbyReminderError: () => null,
  useDebateLobby: () => ({ data: undefined, refetch: vi.fn() }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: () => ({ intent: undefined, isQueued: false, queue: mocks.queue, cancel: vi.fn() }),
}));

const { HubLiveStrip, askShareLeft } = await import('./hub-live-strip');
const { lobbyLineup } = await import('../lobbies/live-lobbies');

const CLAIM = {
  id: 'dc-1',
  space_id: 'space1',
  claim_entity_id: 'claim1',
  claim: 'Ranked-choice voting for federal elections',
  description: null,
};

function lobby(overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary {
  return {
    lobby_id: 'lobby1',
    name: 'NYC Debates',
    scheduled: false,
    starts_at: new Date().toISOString(),
    opens_at: new Date().toISOString(),
    open: true,
    hosts: [],
    headcount: 14,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_on_roster: false,
    ...overrides,
  };
}

const EMPTY: LobbyLineup = { live: [], next: null };

beforeEach(() => {
  mocks.ask = null;
  mocks.ended = null;
  mocks.auth = { ready: true, authenticated: true };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HubLiveStrip', () => {
  it('draws nothing at all when there is nothing to say', () => {
    const { container } = render(<HubLiveStrip lineup={EMPTY} />);

    expect(container).toBeEmptyDOMElement();
  });

  // The full live card, not a one-line strip (Preston, 28 Oct).
  it('shows a live lobby as the live card, with Join', () => {
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    const card = within(screen.getByRole('region', { name: 'Live debate lobby' }));
    expect(card.getByText('Live')).toBeInTheDocument();
    expect(card.getByRole('heading', { name: 'NYC Debates' })).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Join lobby' })).toHaveAttribute('href', '/debate/lobby1');
  });

  // GEO-3519: signed in, the timeline is the place for lobbies still to open. The live card stays.
  it('shows a signed-in viewer no strip for a lobby still to open, and keeps the live card', () => {
    const later = lobby({ lobby_id: 'later', open: false, scheduled: true, name: 'AI policy night' });
    const { container, rerender } = render(<HubLiveStrip lineup={lobbyLineup([later])} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<HubLiveStrip lineup={lobbyLineup([later, lobby()])} />);
    expect(screen.getByTestId('lobby-spotlight')).toHaveTextContent('NYC Debates');
    expect(screen.queryByText('AI policy night')).not.toBeInTheDocument();
  });

  it('shows a signed-in viewer the Today’s claims callout', () => {
    render(<HubLiveStrip lineup={EMPTY} todaysCallout={<section aria-label="Today’s claims" />} />);
    expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
  });

  // Signed out there is no Requests tab, so the next lobby keeps its strip (Preston, 28 Oct).
  describe('signed out', () => {
    const later = lobby({ lobby_id: 'later', open: false, scheduled: true, name: 'AI policy night' });

    beforeEach(() => {
      mocks.auth = { ready: true, authenticated: false };
    });

    it('shows the next lobby still to open, light, with RSVP queuing the sign-up', () => {
      render(<HubLiveStrip lineup={lobbyLineup([later])} />);

      const strip = screen.getByTestId('hub-strip-next-lobby');
      expect(strip).toHaveTextContent('AI policy night');
      expect(strip).toHaveClass('bg-white');
      fireEvent.click(within(strip).getByRole('button', { name: 'RSVP' }));
      expect(mocks.queue).toHaveBeenCalledWith('later');
      expect(mocks.signIn).toHaveBeenCalledWith(
        expect.objectContaining({ auth_control: 'remind_lobby', target_id: 'later' }),
        expect.anything()
      );
      expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('opens the lobby’s details from its name', () => {
      render(<HubLiveStrip lineup={lobbyLineup([later])} />);

      fireEvent.click(screen.getByRole('button', { name: 'AI policy night, lobby details' }));
      const details = screen.getByRole('dialog', { name: 'Lobby details' });
      expect(within(details).getByRole('link', { name: 'Open lobby page' })).toHaveAttribute('href', '/debate/later');
    });

    it('leads with a live lobby over the next one', () => {
      render(<HubLiveStrip lineup={lobbyLineup([later, lobby()])} />);

      expect(screen.getByTestId('lobby-spotlight')).toHaveTextContent('NYC Debates');
      expect(screen.queryByTestId('hub-strip-next-lobby')).not.toBeInTheDocument();
    });

    // GEO-3498: a live lobby takes the slot and the callout waits; a scheduled one does not push it out.
    it('puts the Today’s claims callout after a live lobby and ahead of the next one', () => {
      const callout = <section aria-label="Today’s claims" />;

      const { rerender } = render(<HubLiveStrip lineup={lobbyLineup([later])} todaysCallout={callout} />);
      expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
      expect(screen.queryByTestId('hub-strip-next-lobby')).not.toBeInTheDocument();

      rerender(<HubLiveStrip lineup={lobbyLineup([later, lobby()])} todaysCallout={callout} />);
      expect(screen.getByTestId('lobby-spotlight')).toHaveTextContent('NYC Debates');
      expect(screen.queryByRole('region', { name: 'Today’s claims' })).not.toBeInTheDocument();
    });

    it('shows nothing while auth is still resolving, so a signed-in viewer never sees it flash', () => {
      mocks.auth = { ready: false, authenticated: false };
      const { container } = render(<HubLiveStrip lineup={lobbyLineup([later])} />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  it('puts your open request ahead of a live lobby, with the time left and Cancel', () => {
    mocks.ask = {
      kind: 'claim',
      id: 'req-1',
      claim: CLAIM,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72_000).toISOString(),
    };
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    expect(screen.queryByTestId('lobby-spotlight')).not.toBeInTheDocument();
    const strip = screen.getByTestId('hub-strip-ask');
    expect(strip).toHaveTextContent('Requesting · people who disagree');
    expect(strip).toHaveTextContent(CLAIM.claim);
    expect(strip).toHaveTextContent('1:12');
    expect(strip).not.toHaveTextContent(/Asking/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });

  it('names the person a challenge went to', () => {
    mocks.ask = {
      kind: 'person',
      id: 'ch-1',
      recipientProfileSpaceId: 'person1',
      recipientName: 'Ana Ruiz',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72_000).toISOString(),
    };
    render(<HubLiveStrip lineup={EMPTY} />);

    expect(screen.getByTestId('hub-strip-ask')).toHaveTextContent('Requesting Ana Ruiz');
  });

  it('says nobody took it once a claim request ends, and offers the calendar filtered to that claim', () => {
    mocks.ended = {
      kind: 'claim',
      id: 'req-1',
      claim: CLAIM,
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    expect(screen.getByTestId('hub-strip-ended')).toHaveTextContent('Nobody took it this time');
    const schedule = screen.getByRole('link', { name: 'Schedule' });
    const params = new URL(schedule.getAttribute('href') ?? '', 'https://geo.local').searchParams;
    expect(params.get('claims')).toBe('space1:claim1');
    expect(params.get('from')).toBe('/explore');

    fireEvent.click(schedule);
    expect(mocks.dismissEnded).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });

  it('offers the person’s times once a challenge ends unanswered, and can be dismissed', () => {
    mocks.ended = {
      kind: 'person',
      id: 'ch-1',
      recipientProfileSpaceId: 'person1',
      recipientName: 'Ana Ruiz',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    render(<HubLiveStrip lineup={EMPTY} />);

    expect(screen.getByTestId('hub-strip-ended')).toHaveTextContent('Ana Ruiz can’t right now');
    const params = new URL(
      screen.getByRole('link', { name: 'Schedule' }).getAttribute('href') ?? '',
      'https://geo.local'
    ).searchParams;
    expect(params.get('people')).toBe('person1');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.dismissEnded).toHaveBeenCalled();
  });
});

describe('askShareLeft', () => {
  // The bar is measured against the ask's own lifetime, so a 2-minute challenge and a 90 s claim
  // request both start full, whatever geo-chat's timeouts become.
  it('is the share of the ask’s own lifetime still left', () => {
    const ask = { createdAt: '2026-10-23T12:00:00.000Z', expiresAt: '2026-10-23T12:02:00.000Z' };
    expect(askShareLeft(ask, 120_000)).toBe(1);
    expect(askShareLeft(ask, 30_000)).toBe(0.25);
    expect(askShareLeft({ createdAt: ask.createdAt, expiresAt: '2026-10-23T12:01:30.000Z' }, 45_000)).toBe(0.5);
  });

  it('draws an empty bar rather than a broken one for unusable times', () => {
    expect(askShareLeft({ createdAt: 'nope', expiresAt: 'nope' }, 10_000)).toBe(0);
  });
});
