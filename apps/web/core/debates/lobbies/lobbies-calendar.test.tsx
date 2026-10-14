import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

// Wednesday 14 October 2026, noon local: the week shown runs Sunday 11 to Saturday 17.
const NOW = new Date(2026, 9, 14, 12, 0).getTime();

const mocks = vi.hoisted(() => ({
  lobbies: [] as DebateLobbySummary[],
  listFailed: false,
  mutate: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useDebateLobbies: () =>
    mocks.listFailed
      ? { data: undefined, isLoading: false, error: new Error('boom'), refetch: vi.fn() }
      : { data: { lobbies: mocks.lobbies }, isLoading: false, error: null, refetch: vi.fn() },
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, isPending: false, isError: false }),
  useLobbyReminderError: () => null,
}));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('./lobby-people', () => ({ LobbyAvatarStack: () => null }));

const { lobbiesByDay, lobbiesPinnedRow, lobbyDayLeads, useWeekLobbies } = await import('./lobbies-calendar');

const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Bryan', avatar_cid: null };

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();
// Eight midnights, as the calendar passes them: Sunday 11 to the Sunday after.
const WEEK = Array.from({ length: 8 }, (_, index) => new Date(2026, 9, 11 + index));

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

/** Wednesday's cell of the pinned row. */
const renderWednesday = (lobbies: DebateLobbySummary[]) => {
  const byDay = lobbiesByDay(lobbies, WEEK);
  return render(<div data-testid="day">{lobbiesPinnedRow(byDay).renderDay(WEEK[3]!, 3)}</div>);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.lobbies = [];
  mocks.listFailed = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('lobbiesByDay', () => {
  it('puts each lobby on its local day, soonest first', () => {
    const late = lobby({ lobby_id: 'late', starts_at: at(14, 19) });
    const early = lobby({ lobby_id: 'early', starts_at: at(14, 16) });
    const saturday = lobby({ lobby_id: 'sat', starts_at: at(17, 11) });

    const byDay = lobbiesByDay([late, saturday, early], WEEK);
    expect(byDay[3]!.map(l => l.lobby_id)).toEqual(['early', 'late']);
    expect(byDay[6]!.map(l => l.lobby_id)).toEqual(['sat']);
    expect(byDay[0]).toEqual([]);
  });
});

describe('useWeekLobbies', () => {
  it('gives the week’s lobbies by day, for the seven days only', () => {
    mocks.lobbies = [lobby({ lobby_id: 'wed' }), lobby({ lobby_id: 'next-sun', starts_at: at(18, 10) })];
    const { result } = renderHook(() => useWeekLobbies(WEEK));
    expect(result.current.byDay).toHaveLength(7);
    expect(result.current.byDay!.flat().map(l => l.lobby_id)).toEqual(['wed']);
  });

  it('is null with no lobby that week, so the calendar draws no row', () => {
    mocks.lobbies = [lobby({ starts_at: at(25, 10) })];
    expect(renderHook(() => useWeekLobbies(WEEK)).result.current.byDay).toBeNull();
  });

  it('passes a failed read on, so the calendar can say so', () => {
    mocks.listFailed = true;
    const { result } = renderHook(() => useWeekLobbies(WEEK));
    expect(result.current.byDay).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('the pinned Lobbies row', () => {
  it('labels the row Lobbies and shows each lobby as its time and name', () => {
    const byDay = lobbiesByDay([lobby({ name: 'NYC Debates' })], WEEK);
    expect(lobbiesPinnedRow(byDay).label).toBe('Lobbies');

    renderWednesday([lobby({ name: 'NYC Debates' })]);
    const time = new Date(2026, 9, 14, 16).toLocaleTimeString(undefined, { hour: 'numeric' });
    expect(screen.getByTestId('lobby-chip')).toHaveTextContent(`${time}NYC Debates`);
  });

  it('draws a live lobby dark with Live, and one the viewer is going to with a solid outline', () => {
    renderWednesday([
      lobby({ lobby_id: 'live', name: 'Live now', open: true, headcount: 14 }),
      lobby({ lobby_id: 'going', name: 'Going to this', viewer_reminded: true, starts_at: at(14, 18) }),
    ]);
    const [live, going] = screen.getAllByTestId('lobby-chip');
    expect(live).toHaveTextContent('LiveLive now');
    expect(live).toHaveClass('bg-[#151515]');
    expect(going).toHaveClass('border-text');
    expect(going).toHaveAccessibleName(expect.stringContaining('going'));
  });

  it('opens a chip’s card, with its host, who is going, and RSVP', () => {
    renderWednesday([lobby({ lobby_id: 'nyc', name: 'NYC Debates', reminder_count: 6 })]);

    fireEvent.click(screen.getByTestId('lobby-chip'));
    const card = screen.getByTestId('lobby-calendar-card');
    expect(card).toHaveTextContent('Bryan · 6 going');
    expect(within(card).getByRole('link', { name: 'NYC Debates' })).toHaveAttribute('href', '/debate/nyc');
    // Counted on the calendar, under its own prefix.
    expect(within(card).getByRole('button', { name: 'RSVP' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Lobby RSVP'
    );
    fireEvent.click(within(card).getByRole('button', { name: 'RSVP' }));
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'nyc', reminded: true });
  });

  it('opens a live chip’s card with its headcount and Join', () => {
    renderWednesday([lobby({ lobby_id: 'live', name: 'Live now', open: true, headcount: 14 })]);

    fireEvent.click(screen.getByTestId('lobby-chip'));
    const card = screen.getByTestId('lobby-calendar-card');
    expect(card).toHaveTextContent('· 14 here');
    // The host stays on the card once the lobby opens, as on every other live surface.
    expect(card).toHaveTextContent('Bryan');
    expect(within(card).getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/debate/live');
  });

  it('keeps a busy day to two chips and +N more, which lists the whole day', () => {
    renderWednesday(['a', 'b', 'c'].map((id, index) => lobby({ lobby_id: id, starts_at: at(14, 16 + index) })));

    expect(screen.getAllByTestId('lobby-chip')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getAllByTestId('lobby-calendar-card')).toHaveLength(3);
  });

  it('draws nothing on a day without lobbies', () => {
    const byDay = lobbiesByDay([lobby({})], WEEK);
    render(<div data-testid="day">{lobbiesPinnedRow(byDay).renderDay(WEEK[0]!, 0)}</div>);
    expect(screen.getByTestId('day')).toBeEmptyDOMElement();
  });
});

describe('lobbyDayLeads', () => {
  it('gives the phone list each day’s lobbies as cards, and nothing for an empty day', () => {
    const leads = lobbyDayLeads(lobbiesByDay([lobby({ name: 'NYC Debates' })], WEEK));
    expect(leads[0]).toBeNull();
    render(<>{leads[3]}</>);
    expect(screen.getByTestId('lobby-calendar-card')).toHaveTextContent('NYC Debates');
  });
});
