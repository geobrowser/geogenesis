import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), markLobbyEntry: vi.fn(), signIn: vi.fn(), authenticated: true }));

// The signed-out Remind me opens Privy, which needs the wallet provider (GEO-3289).
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: null }),
}));
vi.mock('./hooks', () => ({
  useDebateLobbies: () => ({ data: undefined }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, isPending: false, isError: false }),
  useLobbyReminderError: () => null,
}));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: mocks.markLobbyEntry }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));

const { LobbySpotlight } = await import('./lobby-spotlight');

const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Bryan', avatar_cid: null };

const lobby = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'nyc',
  name: 'NYC Debates',
  scheduled: false,
  starts_at: '2026-10-13T18:00:00Z',
  opens_at: '2026-10-13T18:00:00Z',
  open: true,
  hosts: [host],
  headcount: 14,
  avatars: [host],
  debating_count: 6,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.authenticated = true;
});

describe('LobbySpotlight', () => {
  it('renders nothing with nothing live or due', () => {
    const { container } = render(<LobbySpotlight lineup={{ live: [], soon: null, later: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the lobby: Live, its name, host, who is there and Join', () => {
    render(<LobbySpotlight lineup={{ live: [lobby({})], soon: null, later: [] }} />);
    const card = within(screen.getByRole('region', { name: 'Live debate lobby' }));

    expect(card.getByText('Live')).toBeInTheDocument();
    expect(card.getByRole('heading', { name: 'NYC Debates' })).toBeInTheDocument();
    expect(card.getByText('Hosted by Bryan')).toBeInTheDocument();
    expect(card.getByText('14 here · 6 debating')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Join lobby' })).toHaveAttribute('href', '/debate/nyc');
  });

  it('marks the join as coming from the side panel', () => {
    render(<LobbySpotlight lineup={{ live: [lobby({})], soon: null, later: [] }} />);
    screen.getByRole('link', { name: 'Join lobby' }).click();
    expect(mocks.markLobbyEntry).toHaveBeenCalledWith('nyc', 'side_panel');
  });

  it('offers the way back in, not Join, to someone already in the lobby', () => {
    render(<LobbySpotlight lineup={{ live: [lobby({ viewer_on_roster: true })], soon: null, later: [] }} />);
    expect(screen.getByRole('link', { name: 'Back to lobby' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join lobby' })).not.toBeInTheDocument();
    expect(screen.getByText('14 here · 6 debating · You’re here')).toBeInTheDocument();
  });

  it('lists every other live lobby under the lead, each with its own Join', () => {
    const other = lobby({ lobby_id: 'ai', name: 'AI Policy Night', headcount: 5, debating_count: 2 });
    render(<LobbySpotlight lineup={{ live: [lobby({}), other], soon: null, later: [] }} />);

    expect(screen.getByRole('region', { name: 'Live debate lobbies' })).toBeInTheDocument();
    expect(screen.getByText('2 lobbies live')).toBeInTheDocument();
    const row = within(screen.getByTestId('also-live-row'));
    expect(row.getByText('AI Policy Night')).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/debate/ai');
  });

  it('counts down to a lobby opening soon and offers RSVP', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-10-13T17:48:00Z'));
    const soon = lobby({ open: false, scheduled: true, opens_at: '2026-10-13T18:00:00Z', reminder_count: 6 });
    render(<LobbySpotlight lineup={{ live: [], soon, later: [] }} />);

    const card = within(screen.getByRole('region', { name: 'Upcoming debate lobby' }));
    expect(card.getByText('Opens in 12 min')).toBeInTheDocument();
    expect(card.getByText('Hosted by Bryan · 6 going')).toBeInTheDocument();
    card.getByRole('button', { name: 'RSVP' }).click();
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'nyc', reminded: true });
    vi.useRealTimers();
  });

  // GEO-3289. Signed out, Remind me opens the account prompt; the reminder waits for the account.
  it('asks a signed-out visitor to sign in for RSVP rather than setting it', () => {
    mocks.authenticated = false;
    const soon = lobby({ open: false, scheduled: true, opens_at: '2099-10-13T18:00:00Z' });
    render(<LobbySpotlight lineup={{ live: [], soon, later: [] }} />);

    screen.getByRole('button', { name: 'RSVP' }).click();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'remind_lobby', target_id: 'nyc' }),
      expect.objectContaining({ onCancel: expect.any(Function) })
    );
  });

  it('shows the live lobby, not the soon one, when both exist', () => {
    const soon = lobby({ lobby_id: 'later', name: 'Open floor', open: false, scheduled: true });
    render(<LobbySpotlight lineup={{ live: [lobby({})], soon, later: [] }} />);
    expect(screen.getByRole('heading', { name: 'NYC Debates' })).toBeInTheDocument();
    expect(screen.queryByText('Open floor')).not.toBeInTheDocument();
  });
});
