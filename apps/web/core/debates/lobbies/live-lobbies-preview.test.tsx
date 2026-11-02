import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const mocks = vi.hoisted(() => ({ markLobbyEntry: vi.fn() }));

vi.mock('./lobby-analytics', () => ({ markLobbyEntry: mocks.markLobbyEntry }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));

const { LiveLobbyRow } = await import('./live-lobbies-preview');

const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Adam', avatar_cid: null };

const live = (overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary => ({
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
  reminder_count: 3,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

const renderRow = (lobby: DebateLobbySummary) =>
  render(
    <ul>
      <LiveLobbyRow lobby={lobby} />
    </ul>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// GEO-3268. The Debate button's hover list: every row is live, so the heading says it once.
describe('LiveLobbyRow', () => {
  it('shows the name, faces, who is there and Join, then the hosts, with no Live line of its own', () => {
    renderRow(live());
    const row = screen.getByTestId('live-lobby-row');
    const text = row.textContent ?? '';

    expect(text).not.toContain('Live');
    expect(text.indexOf('Onboarding with Adam')).toBeLessThan(text.indexOf('10 here · 2 debating'));
    expect(text.indexOf('Join')).toBeLessThan(text.indexOf('Hosted by Adam'));
    // A live lobby says who is there, not who RSVP'd.
    expect(text).not.toContain('going');
    expect(within(row).getByTestId('avatar-stack')).toBeInTheDocument();
  });

  it('marks a join as coming from the navbar', () => {
    renderRow(live());
    screen.getByRole('link', { name: 'Join' }).click();
    expect(mocks.markLobbyEntry).toHaveBeenCalledWith('lobby1', 'nav');
  });

  it('offers Open to someone already in the lobby', () => {
    renderRow(live({ viewer_on_roster: true }));
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/debate/lobby1');
    expect(screen.getByTestId('live-lobby-row')).toHaveTextContent('You’re here');
  });
});
