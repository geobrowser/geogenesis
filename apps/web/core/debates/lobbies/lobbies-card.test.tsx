import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const mocks = vi.hoisted(() => ({ lobbies: [] as DebateLobbySummary[] }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => true }));
vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: true }) }));
vi.mock('./hooks', () => ({
  useDebateLobbies: () => ({ data: { lobbies: mocks.lobbies }, isLoading: false, isError: false }),
  useDebateLobbyReminder: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useLobbyReminderError: () => null,
}));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));
vi.mock('./open-lobby-dialog', () => ({ OpenLobbyDialog: () => null }));

const { LiveLobbiesCard } = await import('./lobbies-card');

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

beforeEach(() => {
  mocks.lobbies = [];
});

afterEach(cleanup);

const row = () => within(screen.getByTestId('lobby-row'));

describe('LiveLobbiesCard rows', () => {
  it('shows an open lobby as Live, then its name, faces, counts and Join, then its host', () => {
    mocks.lobbies = [summary({})];
    render(<LiveLobbiesCard />);

    const text = screen.getByTestId('lobby-row').textContent ?? '';
    expect(text.indexOf('Live')).toBeLessThan(text.indexOf('Onboarding with Adam'));
    expect(text.indexOf('Onboarding with Adam')).toBeLessThan(text.indexOf('10 here · 2 debating'));
    expect(text.indexOf('Join')).toBeLessThan(text.indexOf('Hosted by Adam'));
    expect(row().getByTestId('avatar-stack')).toBeTruthy();
    expect(row().getByRole('link', { name: 'Join' })).toBeTruthy();
  });

  it('puts a scheduled lobby’s time above its name, with host and reminders beside Remind me', () => {
    mocks.lobbies = [
      summary({
        open: false,
        scheduled: true,
        starts_at: '2026-10-20T18:00:00Z',
        opens_at: '2026-10-20T17:50:00Z',
        reminder_count: 6,
        name: 'Tuesday debate hour',
      }),
    ];
    render(<LiveLobbiesCard />);

    const text = screen.getByTestId('lobby-row').textContent ?? '';
    expect(text).not.toContain('Live');
    expect(text.indexOf('opens')).toBeLessThan(text.indexOf('Tuesday debate hour'));
    expect(text).toContain('Hosted by Adam · 6 reminded');
    expect(row().getByRole('button', { name: 'Remind me' })).toBeTruthy();
    expect(row().queryByTestId('avatar-stack')).toBeNull();
  });
});
