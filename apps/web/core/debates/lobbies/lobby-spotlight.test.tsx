import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const mocks = vi.hoisted(() => ({ markLobbyEntry: vi.fn() }));

vi.mock('./lobby-analytics', () => ({ markLobbyEntry: mocks.markLobbyEntry }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));

const { LiveLobbySpotlight } = await import('./lobby-spotlight');

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
});

describe('LiveLobbySpotlight', () => {
  it('renders nothing with nothing live', () => {
    const { container } = render(<LiveLobbySpotlight lineup={{ live: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the lobby: Live, its name, host, who is there and Join', () => {
    render(<LiveLobbySpotlight lineup={{ live: [lobby({})] }} />);
    const card = within(screen.getByRole('region', { name: 'Live debate lobby' }));

    expect(card.getByText('Live')).toBeInTheDocument();
    expect(card.getByRole('heading', { name: 'NYC Debates' })).toBeInTheDocument();
    expect(card.getByText('Hosted by Bryan')).toBeInTheDocument();
    expect(card.getByText('14 here · 6 debating')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Join lobby' })).toHaveAttribute('href', '/debate/nyc');
  });

  it('marks the join as coming from the side panel', () => {
    render(<LiveLobbySpotlight lineup={{ live: [lobby({})] }} />);
    screen.getByRole('link', { name: 'Join lobby' }).click();
    expect(mocks.markLobbyEntry).toHaveBeenCalledWith('nyc', 'side_panel');
  });

  it('offers the way back in, not Join, to someone already in the lobby', () => {
    render(<LiveLobbySpotlight lineup={{ live: [lobby({ viewer_on_roster: true })] }} />);
    expect(screen.getByRole('link', { name: 'Back to lobby' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join lobby' })).not.toBeInTheDocument();
    expect(screen.getByText('14 here · 6 debating · You’re here')).toBeInTheDocument();
  });

  it('lists every other live lobby under the lead, each with its own Join', () => {
    const other = lobby({ lobby_id: 'ai', name: 'AI Policy Night', headcount: 5, debating_count: 2 });
    render(<LiveLobbySpotlight lineup={{ live: [lobby({}), other] }} />);

    expect(screen.getByRole('region', { name: 'Live debate lobbies' })).toBeInTheDocument();
    expect(screen.getByText('2 lobbies live')).toBeInTheDocument();
    const row = within(screen.getByTestId('also-live-row'));
    expect(row.getByText('AI Policy Night')).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/debate/ai');
  });
});
