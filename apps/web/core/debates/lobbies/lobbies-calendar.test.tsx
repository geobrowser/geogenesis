import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

// Wednesday 14 October 2026, noon local: the week shown runs Monday 12 to Sunday 18.
const NOW = new Date(2026, 9, 14, 12, 0).getTime();

const mocks = vi.hoisted(() => ({ lobbies: [] as DebateLobbySummary[], hosting: false, mutate: vi.fn() }));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => (id === 'lobbyHosting' ? mocks.hosting : true),
}));
vi.mock('./hooks', () => ({
  useDebateLobbies: () => ({
    data: { lobbies: mocks.lobbies },
    isPending: false,
    error: null,
    failureReason: null,
    refetch: vi.fn(),
  }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, isPending: false, isError: false }),
}));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('./lobby-people', () => ({ LobbyAvatarStack: () => null }));
vi.mock('./open-lobby-dialog', () => ({ OpenLobbyDialog: () => null }));
vi.mock('../matchmaking/use-debates-hub', () => ({ useDebatesHub: () => ({ close: vi.fn() }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/matchmaking/calendar',
  useSearchParams: () => new URLSearchParams(),
}));

const { LobbiesCalendarBody, lobbiesByCell, lobbiesByDay } = await import('./lobbies-calendar');

const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Bryan', avatar_cid: null };

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

const lobby = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'lobby',
  name: 'Lobby',
  scheduled: true,
  starts_at: at(14, 16),
  opens_at: at(14, 16),
  open: false,
  hosts: [host],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.lobbies = [];
  mocks.hosting = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('lobbiesByDay', () => {
  const days = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 12 + index));

  it('puts each lobby on its local day, soonest first', () => {
    const late = lobby({ lobby_id: 'late', starts_at: at(14, 19) });
    const early = lobby({ lobby_id: 'early', starts_at: at(14, 16) });
    const saturday = lobby({ lobby_id: 'sat', starts_at: at(17, 11) });

    const byDay = lobbiesByDay([late, saturday, early], days, false);
    expect(byDay[2]!.map(l => l.lobby_id)).toEqual(['early', 'late']);
    expect(byDay[5]!.map(l => l.lobby_id)).toEqual(['sat']);
    expect(byDay[0]).toEqual([]);
  });

  it('keeps only the lobbies the viewer is going to, with Going only', () => {
    const going = lobby({ lobby_id: 'going', viewer_reminded: true });
    const not = lobby({ lobby_id: 'not' });
    expect(lobbiesByDay([going, not], days, true)[2]!.map(l => l.lobby_id)).toEqual(['going']);
  });
});

describe('lobbiesByCell', () => {
  const days = Array.from({ length: 8 }, (_, index) => new Date(2026, 9, 12 + index));

  it('puts each lobby in the hour it starts, soonest first, and leaves out other weeks', () => {
    const half = lobby({ lobby_id: 'half', starts_at: new Date(2026, 9, 14, 16, 30).toISOString() });
    const top = lobby({ lobby_id: 'top', starts_at: at(14, 16) });
    const later = lobby({ lobby_id: 'later', starts_at: at(25, 16) });

    const byCell = lobbiesByCell([half, top, later], days, false);
    expect(byCell.get('2:16')!.map(l => l.lobby_id)).toEqual(['top', 'half']);
    expect(byCell.size).toBe(1);
  });
});

describe('LobbiesCalendarBody', () => {
  it('draws the availability week’s grid, with each lobby a block in its hour', () => {
    mocks.lobbies = [lobby({ lobby_id: 'nyc', name: 'NYC Debates' })];
    render(<LobbiesCalendarBody isPhone={false} />);

    const grid = screen.getByRole('table', { name: 'Debate lobbies each hour this week' });
    // The time column and seven days.
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(8);
    const block = within(grid).getByTestId('lobby-calendar-block');
    const time = new Date(2026, 9, 14, 16).toLocaleTimeString(undefined, { hour: 'numeric' });
    expect(block).toHaveTextContent(`${time} · Bryan`);
    expect(block).toHaveTextContent('NYC Debates');
  });

  it('opens a block’s card, with the hosts linked, who is going, and RSVP', () => {
    mocks.lobbies = [lobby({ lobby_id: 'nyc', name: 'NYC Debates', reminder_count: 6 })];
    render(<LobbiesCalendarBody isPhone={false} />);

    fireEvent.click(screen.getByTestId('lobby-calendar-block'));
    const card = within(screen.getByTestId('lobby-calendar-card'));
    expect(card.getByRole('link', { name: 'NYC Debates' })).toHaveAttribute('href', '/debate/nyc');
    expect(screen.getByTestId('lobby-calendar-card')).toHaveTextContent('Hosted by Bryan · 6 going');
    fireEvent.click(card.getByRole('button', { name: 'RSVP' }));
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'nyc', reminded: true });
  });

  it('draws a live lobby dark with its headcount, and its card offers Join', () => {
    mocks.lobbies = [lobby({ lobby_id: 'live', name: 'Live now', open: true, headcount: 14 })];
    render(<LobbiesCalendarBody isPhone={false} />);

    const block = screen.getByTestId('lobby-calendar-block');
    expect(block).toHaveTextContent('Live · 14 here');
    expect(block).toHaveClass('bg-text');
    fireEvent.click(block);
    expect(within(screen.getByTestId('lobby-calendar-card')).getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      '/debate/live'
    );
  });

  it('keeps a busy hour to two compact blocks and +N more', () => {
    mocks.lobbies = ['a', 'b', 'c'].map(id => lobby({ lobby_id: id, name: `Lobby ${id}` }));
    render(<LobbiesCalendarBody isPhone={false} />);

    expect(screen.getAllByTestId('lobby-calendar-block')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^All 3 lobbies at/ }));
    expect(screen.getAllByTestId('lobby-calendar-card')).toHaveLength(3);
  });

  it('narrows to the lobbies the viewer is going to with Going only', () => {
    mocks.lobbies = [
      lobby({ lobby_id: 'going', name: 'Going to this', viewer_reminded: true }),
      lobby({ lobby_id: 'not', name: 'Not this', starts_at: at(15, 18) }),
    ];
    render(<LobbiesCalendarBody isPhone={false} />);

    act(() => screen.getByRole('button', { name: 'Going only' }).click());
    expect(screen.getByText('Going to this')).toBeInTheDocument();
    expect(screen.queryByText('Not this')).not.toBeInTheDocument();
  });

  it('lists only days with lobbies on a phone, each lobby as its card', () => {
    mocks.lobbies = [lobby({ name: 'NYC Debates' })];
    render(<LobbiesCalendarBody isPhone />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getAllByTestId('lobby-calendar-card')).toHaveLength(1);
  });

  it('says so when the week has no lobbies', () => {
    render(<LobbiesCalendarBody isPhone={false} />);
    expect(screen.getByText('No lobbies scheduled this week.')).toBeInTheDocument();
  });

  it('offers Open a lobby to a host', () => {
    mocks.hosting = true;
    mocks.lobbies = [lobby({})];
    render(<LobbiesCalendarBody isPhone={false} />);
    expect(screen.getByRole('button', { name: 'Open a lobby' })).toBeInTheDocument();
  });
});
