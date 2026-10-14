import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';
import type { LobbyLineup } from './live-lobbies';

const mocks = vi.hoisted(() => ({
  lineup: { live: [], soon: null, later: [] } as LobbyLineup,
  hosting: true,
  mutate: vi.fn(),
  listFailed: false,
}));

// The signed-out Remind me opens Privy, which needs the wallet provider (GEO-3289).
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));
vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => (id === 'lobbyHosting' ? mocks.hosting : true),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../matchmaking/use-debates-hub', () => ({ useDebatesHub: () => ({ close: vi.fn() }) }));
vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: true }) }));
vi.mock('./hooks', () => ({
  useDebateLobbies: () =>
    mocks.listFailed
      ? { data: undefined, isLoading: false, isError: true }
      : { data: { lobbies: [] }, isLoading: false, isError: false },
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, isPending: false, isError: false }),
  useLobbyReminderError: () => null,
}));
vi.mock('./live-lobbies', () => ({ useLobbyLineup: () => mocks.lineup }));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));
vi.mock('./open-lobby-dialog', () => ({ OpenLobbyDialog: () => null }));

const { UpcomingLobbiesCard } = await import('./lobbies-card');

const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Adam', avatar_cid: null };

const summary = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'lobby1',
  name: 'Onboarding with Adam',
  scheduled: false,
  starts_at: '2026-10-12T10:00:00Z',
  opens_at: '2026-10-12T10:00:00Z',
  open: true,
  hosts: [host],
  headcount: 10,
  avatars: [host],
  debating_count: 2,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

const scheduled = (overrides: Partial<DebateLobbySummary>) =>
  summary({
    open: false,
    scheduled: true,
    starts_at: '2026-10-20T18:00:00Z',
    opens_at: '2026-10-20T17:50:00Z',
    ...overrides,
  });

beforeEach(() => {
  mocks.lineup = { live: [], soon: null, later: [] };
  mocks.hosting = true;
  mocks.listFailed = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// GEO-3268. Scheduled lobbies as a sideways row of date cards under the panel's tabs.
describe('UpcomingLobbiesCard', () => {
  it('lists each later lobby as a card with its host, who is going, and RSVP', () => {
    mocks.lineup = {
      live: [],
      soon: null,
      later: [
        scheduled({ lobby_id: 'a', name: 'NYC Debates', reminder_count: 6 }),
        scheduled({ lobby_id: 'b', name: 'AI Policy Night' }),
      ],
    };
    render(<UpcomingLobbiesCard />);

    expect(screen.getByText('Upcoming lobbies · 2')).toBeTruthy();
    const [first, second] = screen.getAllByTestId('upcoming-lobby-card');
    expect(first).toHaveTextContent('NYC Debates');
    expect(first).toHaveTextContent('Adam · 6 going');
    expect(second).toHaveTextContent('AI Policy Night');
    // The hub's prefix, as every hub control's label carries it.
    expect(within(first!).getByRole('button', { name: 'RSVP' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Upcoming lobby RSVP'
    );
    within(first!).getByRole('button', { name: 'RSVP' }).click();
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'a', reminded: true });
  });

  it('stretches a lone card across the row, and keeps several at card width', () => {
    mocks.lineup = { live: [], soon: null, later: [scheduled({})] };
    render(<UpcomingLobbiesCard />);
    expect(screen.getByTestId('upcoming-lobby-card')).toHaveClass('w-full');
    cleanup();

    mocks.lineup = { live: [], soon: null, later: [scheduled({ lobby_id: 'a' }), scheduled({ lobby_id: 'b' })] };
    render(<UpcomingLobbiesCard />);
    for (const card of screen.getAllByTestId('upcoming-lobby-card')) expect(card).not.toHaveClass('w-full');
  });

  it('links to the Calendar, where the week’s lobbies are pinned above the hours', () => {
    mocks.lineup = { live: [], soon: null, later: [scheduled({})] };
    render(<UpcomingLobbiesCard />);

    const link = screen.getByRole('link', { name: 'See the week on Calendar →' });
    expect(link.getAttribute('href')).toContain('/matchmaking/calendar');
  });

  it('leaves the live lobbies and the one opening soon to the spotlight', () => {
    mocks.lineup = { live: [], soon: scheduled({ lobby_id: 'soon', name: 'Opening soon' }), later: [] };
    render(<UpcomingLobbiesCard />);

    expect(screen.queryByText('Opening soon')).toBeNull();
  });

  it('lists the soon lobby once something live has the spotlight', () => {
    mocks.lineup = {
      live: [summary({ lobby_id: 'live', name: 'Live now' })],
      soon: scheduled({ lobby_id: 'soon', name: 'Opening soon' }),
      later: [],
    };
    render(<UpcomingLobbiesCard />);

    expect(screen.queryByText('Live now')).toBeNull();
    expect(screen.getByText('Opening soon')).toBeTruthy();
  });

  it('keeps just Open a lobby for a host when nothing is scheduled', () => {
    render(<UpcomingLobbiesCard />);
    expect(screen.getByRole('button', { name: 'Open a lobby' })).toBeTruthy();
    expect(screen.queryByTestId('upcoming-lobby-card')).toBeNull();
  });

  it('renders nothing for a non-host when nothing is scheduled', () => {
    mocks.hosting = false;
    render(<UpcomingLobbiesCard />);
    expect(screen.queryByTestId('upcoming-lobbies')).toBeNull();
  });

  // Hosting does not depend on the list loading, so a failed list keeps the way to open one.
  it('says the list failed and still offers Open a lobby to a host', () => {
    mocks.listFailed = true;
    render(<UpcomingLobbiesCard />);
    expect(screen.getByText('Could not load lobbies.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open a lobby' })).toBeTruthy();
  });

  it('says the list failed to a non-host too', () => {
    mocks.listFailed = true;
    mocks.hosting = false;
    render(<UpcomingLobbiesCard />);
    expect(screen.getByText('Could not load lobbies.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open a lobby' })).toBeNull();
  });

  // The overflow hook measures the scroller it finds on mount. The list used to mount only with
  // its first lobby, after the hook had found nothing, so the arrows never came.
  it('arrows a row whose lobbies arrive after it first drew empty', () => {
    const widths = {
      scrollWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth'),
      clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    };
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 360 });
    try {
      const { rerender } = render(<UpcomingLobbiesCard />);
      expect(screen.queryByRole('button', { name: 'Show more lobbies' })).toBeNull();

      mocks.lineup = {
        live: [],
        soon: null,
        later: ['a', 'b', 'c'].map(id => scheduled({ lobby_id: id })),
      };
      rerender(<UpcomingLobbiesCard />);
      expect(screen.getByRole('button', { name: 'Show more lobbies' })).toBeTruthy();
    } finally {
      for (const [key, descriptor] of Object.entries(widths)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      }
    }
  });
});
