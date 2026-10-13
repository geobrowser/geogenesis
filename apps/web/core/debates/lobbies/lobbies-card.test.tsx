import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';
import type { LobbyLineup } from './live-lobbies';

const mocks = vi.hoisted(() => ({
  lineup: { live: [], soon: null, later: [] } as LobbyLineup,
  hosting: true,
  mutate: vi.fn(),
}));

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
  useDebateLobbies: () => ({ data: { lobbies: [] }, isLoading: false, isError: false }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, isPending: false, isError: false }),
}));
vi.mock('./live-lobbies', () => ({ useLobbyLineup: () => mocks.lineup }));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));
vi.mock('./open-lobby-dialog', () => ({ OpenLobbyDialog: () => null }));

const { LiveLobbiesCard, LobbyRow } = await import('./lobbies-card');

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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = () => within(screen.getByTestId('lobby-row'));

describe('LobbyRow', () => {
  it('shows an open lobby as Live, then its name, faces, counts and Join, then its host', () => {
    render(
      <ul>
        <LobbyRow lobby={summary({})} />
      </ul>
    );

    const text = screen.getByTestId('lobby-row').textContent ?? '';
    expect(text.indexOf('Live')).toBeLessThan(text.indexOf('Onboarding with Adam'));
    expect(text.indexOf('Onboarding with Adam')).toBeLessThan(text.indexOf('10 here · 2 debating'));
    expect(text.indexOf('Join')).toBeLessThan(text.indexOf('Hosted by Adam'));
    expect(row().getByTestId('avatar-stack')).toBeTruthy();
    expect(row().getByRole('link', { name: 'Join' })).toBeTruthy();
  });

  // GEO-3268: a reminder reads as an RSVP, as on community calls.
  it('puts a scheduled lobby’s time above its name, with host and who is going beside RSVP', () => {
    render(
      <ul>
        <LobbyRow lobby={scheduled({ reminder_count: 6, name: 'Tuesday debate hour' })} />
      </ul>
    );

    const text = screen.getByTestId('lobby-row').textContent ?? '';
    expect(text).not.toContain('Live');
    expect(text.indexOf('opens')).toBeLessThan(text.indexOf('Tuesday debate hour'));
    expect(text).toContain('Hosted by Adam · 6 going');
    expect(row().getByRole('button', { name: 'RSVP' })).toBeTruthy();
    expect(row().queryByTestId('avatar-stack')).toBeNull();
  });

  it('says Going once the viewer has RSVP’d', () => {
    render(
      <ul>
        <LobbyRow lobby={scheduled({ viewer_reminded: true })} />
      </ul>
    );
    expect(row().getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The Debate button's hover list heads every row "Live" once, so the rows drop their own.
  it('drops its Live line when asked, keeping the name, counts and Join', () => {
    render(
      <ul>
        <LobbyRow lobby={summary({})} entry="nav" showLiveMark={false} />
      </ul>
    );

    expect(row().queryByText('Live')).toBeNull();
    expect(row().getByText('Onboarding with Adam')).toBeTruthy();
    expect(row().getByRole('link', { name: 'Join' })).toBeTruthy();
  });
});

// GEO-3268. Scheduled lobbies as a sideways row of date cards under the panel's tabs.
describe('LiveLobbiesCard', () => {
  it('lists each later lobby as a card with its host, who is going, and RSVP', () => {
    mocks.lineup = {
      live: [],
      soon: null,
      later: [
        scheduled({ lobby_id: 'a', name: 'NYC Debates', reminder_count: 6 }),
        scheduled({ lobby_id: 'b', name: 'AI Policy Night' }),
      ],
    };
    render(<LiveLobbiesCard />);

    expect(screen.getByText('Upcoming lobbies · 2')).toBeTruthy();
    const [first, second] = screen.getAllByTestId('upcoming-lobby-card');
    expect(first).toHaveTextContent('NYC Debates');
    expect(first).toHaveTextContent('Adam · 6 going');
    expect(second).toHaveTextContent('AI Policy Night');
    within(first!).getByRole('button', { name: 'RSVP' }).click();
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'a', reminded: true });
  });

  it('links to the Calendar’s Lobbies view', () => {
    mocks.lineup = { live: [], soon: null, later: [scheduled({})] };
    render(<LiveLobbiesCard />);

    const link = screen.getByRole('link', { name: 'See the week on Calendar →' });
    expect(link.getAttribute('href')).toContain('view=lobbies');
  });

  it('leaves the live lobbies and the one opening soon to the spotlight', () => {
    mocks.lineup = { live: [], soon: scheduled({ lobby_id: 'soon', name: 'Opening soon' }), later: [] };
    render(<LiveLobbiesCard />);

    expect(screen.queryByText('Opening soon')).toBeNull();
  });

  it('lists the soon lobby once something live has the spotlight', () => {
    mocks.lineup = {
      live: [summary({ lobby_id: 'live', name: 'Live now' })],
      soon: scheduled({ lobby_id: 'soon', name: 'Opening soon' }),
      later: [],
    };
    render(<LiveLobbiesCard />);

    expect(screen.queryByText('Live now')).toBeNull();
    expect(screen.getByText('Opening soon')).toBeTruthy();
  });

  it('keeps just Open a lobby for a host when nothing is scheduled', () => {
    render(<LiveLobbiesCard />);
    expect(screen.getByRole('button', { name: 'Open a lobby' })).toBeTruthy();
    expect(screen.queryByTestId('upcoming-lobby-card')).toBeNull();
  });

  it('renders nothing for a non-host when nothing is scheduled', () => {
    mocks.hosting = false;
    render(<LiveLobbiesCard />);
    expect(screen.queryByTestId('upcoming-lobbies')).toBeNull();
  });
});
