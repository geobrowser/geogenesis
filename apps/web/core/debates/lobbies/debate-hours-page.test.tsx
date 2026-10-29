import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const NOW = Date.parse('2026-10-28T16:00:00Z');
const HOUR = 60 * 60_000;

const mocks = vi.hoisted(() => ({
  list: { data: undefined, isError: false, refetch: vi.fn() } as {
    data: { lobbies: DebateLobbySummary[] } | undefined;
    isError: boolean;
    refetch: () => void;
  },
  accountKey: null as string | null,
  setToast: vi.fn(),
  press: vi.fn(),
  pressOptions: [] as unknown[],
}));

vi.mock('./hooks', () => ({ useDebateLobbies: () => mocks.list }));
vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ accountKey: mocks.accountKey }) }));
vi.mock('../matchmaking/hooks', () => ({ useMatchmakingScope: () => false }));
vi.mock('./use-minute-now', () => ({ useMinuteNow: () => NOW }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('~/design-system/avatar', () => ({
  Avatar: ({ alt }: { alt?: string }) => <span data-testid="avatar">{alt}</span>,
}));
vi.mock('./lobby-reminder-press', () => ({
  useLobbyReminderPress: (lobby: DebateLobbySummary, options: unknown) => {
    mocks.pressOptions.push(options);
    return { reminded: lobby.viewer_reminded, pending: false, error: null, press: () => mocks.press(lobby.lobby_id) };
  },
  LobbyReminderError: () => null,
}));

const { DebateHoursPage } = await import('./debate-hours-page');

const host = {
  user_id: 'h1',
  profile_space_id: '0123456789abcdef0123456789abcdef',
  display_name: 'Bryan',
  avatar_cid: null,
};
const attendee = {
  user_id: 'a1',
  profile_space_id: 'fedcba9876543210fedcba9876543210',
  display_name: 'Attendee Avery',
  avatar_cid: null,
};

// A lobby opens ten minutes before it starts, so a fixture that moves `starts_at` moves `opens_at` with it.
const lobby = (id: string, overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary => ({
  lobby_id: id,
  name: `Debate ${id}`,
  scheduled: true,
  starts_at: new Date(NOW + 3 * HOUR).toISOString(),
  opens_at: new Date(
    Date.parse(overrides.starts_at ?? new Date(NOW + 3 * HOUR).toISOString()) - 10 * 60_000
  ).toISOString(),
  open: false,
  hosts: [host],
  headcount: 0,
  avatars: [attendee],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

const week = () => [
  lobby('today', { reminder_count: 6 }),
  lobby('wed', { starts_at: new Date(NOW + 26 * HOUR).toISOString(), reminder_count: 4 }),
  lobby('thu', { starts_at: new Date(NOW + 50 * HOUR).toISOString() }),
];

beforeEach(() => {
  mocks.list = { data: { lobbies: week() }, isError: false, refetch: vi.fn() };
  mocks.accountKey = null;
  mocks.pressOptions = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// GEO-3517. Where "Join debate hours" on the home page lands.
describe('DebateHoursPage', () => {
  it('features the next debate hour and lists the rest of the week, each with its host and who is going', () => {
    render(<DebateHoursPage />);

    const featured = screen.getByTestId('featured-debate-hour');
    expect(within(featured).getByRole('heading', { name: 'Debate today' })).toBeInTheDocument();
    expect(featured).toHaveTextContent('Hosted by Bryan · 6 going');

    const cards = screen.getAllByTestId('debate-hour-card');
    expect(cards.map(card => within(card).getByRole('link', { name: /Debate/ }).textContent)).toEqual([
      expect.stringContaining('Debate wed'),
      expect.stringContaining('Debate thu'),
    ]);
    expect(cards[0]).toHaveTextContent('4 going');
    expect(cards[1]).toHaveTextContent('Be the first to RSVP');
    expect(screen.getByText(/3 this week · 10 people going/)).toBeInTheDocument();
  });

  it('identifies hosts only: nobody else in a lobby is named or shown', () => {
    render(<DebateHoursPage />);
    expect(screen.queryByText(/Attendee Avery/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('avatar').every(face => face.textContent === 'Bryan')).toBe(true);
  });

  it('RSVPs from a card, asking a new account for a name only', () => {
    render(<DebateHoursPage />);
    const card = screen.getAllByTestId('debate-hour-card')[0]!;
    fireEvent.click(within(card).getByRole('button', { name: 'RSVP' }));
    expect(mocks.press).toHaveBeenCalledWith('wed');
    expect(mocks.pressOptions.every(options => (options as { nameOnlyOnboarding: boolean }).nameOnlyOnboarding)).toBe(
      true
    );
  });

  it('shows Going on a debate hour the viewer is going to', () => {
    mocks.list = { ...mocks.list, data: { lobbies: [lobby('today', { viewer_reminded: true })] } };
    render(<DebateHoursPage />);
    expect(within(screen.getByTestId('featured-debate-hour')).getByRole('button', { name: 'Going' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('offers Join, not RSVP, on a lobby that is open now', () => {
    mocks.list = { ...mocks.list, data: { lobbies: [lobby('live', { open: true, headcount: 8 })] } };
    render(<DebateHoursPage />);
    const featured = screen.getByTestId('featured-debate-hour');
    expect(featured).toHaveTextContent('Happening now');
    expect(within(featured).getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      expect.stringContaining('live')
    );
    expect(within(featured).queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
  });

  it('offers Join on a second open lobby in the list, with who is there in place of who is going', () => {
    mocks.list = {
      ...mocks.list,
      data: {
        lobbies: [
          lobby('busy', { open: true, headcount: 12 }),
          lobby('quiet', { open: true, headcount: 3, reminder_count: 5 }),
          lobby('later'),
        ],
      },
    };
    render(<DebateHoursPage />);
    const [quiet, later] = screen.getAllByTestId('debate-hour-card');
    expect(within(quiet!).getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      expect.stringContaining('quiet')
    );
    expect(within(quiet!).queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
    expect(quiet).toHaveTextContent('3 here');
    expect(quiet).not.toHaveTextContent('5 going');
    expect(within(later!).getByRole('button', { name: 'RSVP' })).toBeInTheDocument();
  });

  it('says plainly when nothing is scheduled this week, and points somewhere to watch', () => {
    mocks.list = { ...mocks.list, data: { lobbies: [] } };
    render(<DebateHoursPage />);
    expect(screen.getByTestId('no-debate-hours')).toHaveTextContent('No debate hours this week yet');
    expect(screen.getByRole('link', { name: 'Watch debates' })).toHaveAttribute('href', '/explore');
    expect(screen.queryByTestId('debate-hour-card')).not.toBeInTheDocument();
  });

  it('offers Try again when the list cannot be read', () => {
    mocks.list = { data: undefined, isError: true, refetch: vi.fn() };
    render(<DebateHoursPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.list.refetch).toHaveBeenCalled();
  });

  describe('the going confirmation', () => {
    it('confirms once a debate hour turns to Going, and not for ones the viewer was already going to', () => {
      mocks.accountKey = 'account-1';
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a', { viewer_reminded: true }), lobby('b')] } };
      const { rerender } = render(<DebateHoursPage />);
      expect(mocks.setToast).not.toHaveBeenCalled();

      mocks.list = {
        ...mocks.list,
        data: { lobbies: [lobby('a', { viewer_reminded: true }), lobby('b', { viewer_reminded: true })] },
      };
      rerender(<DebateHoursPage />);
      expect(mocks.setToast).toHaveBeenCalledTimes(1);
      render(mocks.setToast.mock.calls[0]![0]);
      expect(screen.getByText(/You’re going to Debate b\. We’ve emailed you a calendar invite\./)).toBeInTheDocument();
    });

    it('takes a list read for a new account as its starting point rather than confirming', () => {
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a')] } };
      const { rerender } = render(<DebateHoursPage />);

      mocks.accountKey = 'new-account';
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a', { viewer_reminded: true })] } };
      rerender(<DebateHoursPage />);
      expect(mocks.setToast).not.toHaveBeenCalled();
    });

    it('confirms an RSVP queued before sign-up once it lands for the new account', () => {
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a')] } };
      const { rerender } = render(<DebateHoursPage />);

      // Signed up: the new account's list arrives, then the queued RSVP lands on it.
      mocks.accountKey = 'new-account';
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a')] } };
      rerender(<DebateHoursPage />);
      mocks.list = { ...mocks.list, data: { lobbies: [lobby('a', { viewer_reminded: true })] } };
      rerender(<DebateHoursPage />);
      expect(mocks.setToast).toHaveBeenCalledTimes(1);
    });
  });
});
