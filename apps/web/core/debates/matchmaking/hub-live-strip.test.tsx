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
  remind: vi.fn(),
  reminded: false,
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
// RSVP has its own suite; here it only matters that the strip offers it.
vi.mock('../lobbies/lobby-reminder-press', () => ({
  useLobbyReminderPress: () => ({ reminded: mocks.reminded, pending: false, error: null, press: mocks.remind }),
  LobbyReminderError: () => null,
}));

// The lobby's own read, for what the list row leaves out (GEO-3463 details).
const lobbyView = vi.hoisted(() => ({ data: undefined as unknown, refetch: vi.fn() }));
vi.mock('../lobbies/hooks', () => ({ useDebateLobby: () => lobbyView }));
vi.mock('../lobbies/lobby-host-lobbies', () => ({
  usePreOpenHosts: (lobby: { hosts?: unknown[] }) => lobby.hosts ?? [],
}));
vi.mock('../lobbies/lobby-claim-list-tab', () => ({
  useClaimListName: (list: { entity_id: string }) => `List ${list.entity_id}`,
}));

window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { HubLiveStrip, askShareLeft } = await import('./hub-live-strip');

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

const EMPTY: LobbyLineup = { live: [], soon: null, later: [] };

beforeEach(() => {
  mocks.ask = null;
  mocks.ended = null;
  mocks.reminded = false;
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

  it('shows a live lobby with Join', () => {
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    const strip = screen.getByTestId('hub-strip-live-lobby');
    expect(strip).toHaveTextContent('Live');
    expect(strip).toHaveTextContent('NYC Debates');
    expect(strip).toHaveTextContent('14 here');
    expect(strip).toHaveAttribute('href', '/debate/lobby1');
  });

  it('shows the next scheduled lobby with RSVP when none is live', () => {
    const later = lobby({ open: false, scheduled: true, name: 'AI policy night' });
    render(<HubLiveStrip lineup={{ ...EMPTY, later: [later] }} />);

    const strip = screen.getByTestId('hub-strip-next-lobby');
    expect(strip).toHaveTextContent('AI policy night');
    fireEvent.click(screen.getByRole('button', { name: 'RSVP' }));
    expect(mocks.remind).toHaveBeenCalled();
  });

  // Review: the strip drew its own RSVP with the calendar's look inverted. It is the calendar's pill.
  it('draws RSVP outlined and Going black, as the calendar does', () => {
    const later = lobby({ open: false, scheduled: true });
    const { rerender } = render(<HubLiveStrip lineup={{ ...EMPTY, later: [later] }} />);
    expect(screen.getByRole('button', { name: 'RSVP' })).not.toHaveClass('bg-text');

    mocks.reminded = true;
    rerender(<HubLiveStrip lineup={{ ...EMPTY, later: [later] }} />);
    expect(screen.getByRole('button', { name: 'Going' })).toHaveClass('bg-text', 'text-white');
  });

  // 26 Oct (Preston): black means live. A lobby on Tuesday is not.
  it('draws an upcoming lobby light, not on the live strip’s black', () => {
    const later = lobby({ open: false, scheduled: true });
    render(<HubLiveStrip lineup={{ ...EMPTY, later: [later] }} />);

    const strip = screen.getByTestId('hub-strip-next-lobby');
    expect(strip).toHaveClass('bg-white');
    expect(strip.className).not.toMatch(/151515/);
  });

  it('opens the lobby’s details from its name: full name, hosts, who is going and its claim lists', () => {
    const host = { user_id: 'host-1', profile_space_id: 'space-host', display_name: 'Bryan', avatar_cid: null };
    const person = (id: string, name: string) => ({
      user_id: id,
      profile_space_id: `space-${id}`,
      display_name: name,
      avatar_cid: null,
    });
    lobbyView.data = {
      name: 'Geo Open Debates - Politics and Policy Night',
      hosts: [host],
      reminder_count: 14,
      going: [person('a', 'Ana'), person('b', 'Ben')],
      claim_lists: [{ entity_id: 'page-1', space_id: 'space-1', position: 0, added_by: null, added_at: '' }],
    };
    const later = lobby({ open: false, scheduled: true, name: 'Geo Open Debates - Pol…', reminder_count: 14 });
    render(<HubLiveStrip lineup={{ ...EMPTY, later: [later] }} />);

    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    const details = screen.getByRole('dialog', { name: 'Lobby details' });

    expect(details).toHaveTextContent('Geo Open Debates - Politics and Policy Night');
    expect(details).toHaveTextContent('Hosted by Bryan');
    expect(details).toHaveTextContent('Ana, Ben and 12 more going');
    expect(details).toHaveTextContent('List page-1');
    expect(within(details).getByRole('link', { name: 'Open lobby page' })).toHaveAttribute('href', '/debate/lobby1');
    lobbyView.data = undefined;
  });

  // Review, 27 Oct: someone else's RSVP reaches this viewer only as the list row's count, and the
  // details kept the view's older count and names.
  it('keeps the details’ going count live, and reads the names again when it moves', () => {
    const person = (id: string, name: string) => ({
      user_id: id,
      profile_space_id: `space-${id}`,
      display_name: name,
      avatar_cid: null,
    });
    lobbyView.data = { reminder_count: 2, going: [person('a', 'Ana'), person('b', 'Ben')] };
    const later = (count: number) => lobby({ open: false, scheduled: true, reminder_count: count });
    const { rerender } = render(<HubLiveStrip lineup={{ ...EMPTY, later: [later(2)] }} />);
    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    expect(screen.getByTestId('lobby-going')).toHaveTextContent('Ana and Ben going');
    expect(lobbyView.refetch).not.toHaveBeenCalled();

    rerender(<HubLiveStrip lineup={{ ...EMPTY, later: [later(3)] }} />);

    expect(screen.getByTestId('lobby-going')).toHaveTextContent('Ana, Ben and 1 more going');
    expect(lobbyView.refetch).toHaveBeenCalledTimes(1);
    lobbyView.data = undefined;
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

    expect(screen.queryByTestId('hub-strip-live-lobby')).not.toBeInTheDocument();
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
