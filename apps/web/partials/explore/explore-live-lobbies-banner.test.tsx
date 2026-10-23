import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({ live: [] as DebateLobbySummary[], markLobbyEntry: vi.fn(), authenticated: true }));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: mocks.authenticated }) }));

vi.mock('~/core/debates/lobbies/live-lobbies', () => ({
  useLobbyLineup: () => ({ live: mocks.live, soon: null, later: [] }),
}));
vi.mock('~/core/debates/lobbies/lobby-analytics', () => ({ markLobbyEntry: mocks.markLobbyEntry }));
vi.mock('~/core/debates/lobbies/lobby-people', () => ({
  LobbyAvatarStack: ({ total }: { total: number }) => <span data-testid="avatar-stack">{total}</span>,
}));
vi.mock('~/core/debates/lobbies/hooks', () => ({ useDebateLobbyReminder: () => ({}) }));
vi.mock('~/design-system/client-only', () => ({
  ClientOnly: ({ children }: { children: unknown }) => children,
}));

const { ExploreLiveLobbiesBanner } = await import('./explore-live-lobbies-banner');

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

function renderBanner(store = createStore()) {
  render(
    <Provider store={store}>
      <ExploreLiveLobbiesBanner />
    </Provider>
  );
  return store;
}

beforeEach(() => {
  mocks.live = [];
  mocks.authenticated = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExploreLiveLobbiesBanner', () => {
  it('shows nothing with no lobby live', () => {
    renderBanner();
    expect(screen.queryByTestId('explore-live-lobbies-banner')).not.toBeInTheDocument();
  });

  it('names the live lobby, who is there, its host, and offers Join', () => {
    mocks.live = [lobby({})];
    renderBanner();

    expect(screen.getByRole('heading', { name: 'NYC Debates is live' })).toBeInTheDocument();
    expect(screen.getByText('14 here · 6 debating · Hosted by Bryan')).toBeInTheDocument();
    const join = screen.getByRole('link', { name: 'Join lobby' });
    expect(join).toHaveAttribute('href', '/debate/nyc');
    join.click();
    expect(mocks.markLobbyEntry).toHaveBeenCalledWith('nyc', 'explore_banner');
  });

  it('leads with the first lobby and lists the others with their own Join', () => {
    mocks.live = [lobby({}), lobby({ lobby_id: 'ai', name: 'AI Policy Night', headcount: 5 })];
    renderBanner();

    expect(screen.getByRole('heading', { name: 'NYC Debates is live' })).toBeInTheDocument();
    expect(screen.getByTestId('explore-also-live-row')).toHaveTextContent('AI Policy Night');
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/debate/ai');
  });

  it('leaves out a lobby the viewer is already in', () => {
    mocks.live = [lobby({ viewer_on_roster: true })];
    renderBanner();
    expect(screen.queryByTestId('explore-live-lobbies-banner')).not.toBeInTheDocument();
  });

  it('dismisses only the lobbies on screen, so the next lobby to go live shows again', () => {
    mocks.live = [lobby({})];
    const store = renderBanner();

    act(() => screen.getByRole('button', { name: 'Dismiss live lobby' }).click());
    expect(screen.queryByTestId('explore-live-lobbies-banner')).not.toBeInTheDocument();

    cleanup();
    mocks.live = [lobby({}), lobby({ lobby_id: 'ai', name: 'AI Policy Night' })];
    renderBanner(store);
    expect(screen.getByRole('heading', { name: 'AI Policy Night is live' })).toBeInTheDocument();
    expect(screen.queryByText('NYC Debates is live')).not.toBeInTheDocument();
  });

  // GEO-3289. Signed-out visitors find lobbies in the navbar and the debates panel only.
  // Its own lobby: dismissals persist across tests, and `nyc` was dismissed above.
  it('shows nothing to a signed-out visitor', () => {
    mocks.authenticated = false;
    mocks.live = [lobby({ lobby_id: 'signed-out-only' })];
    renderBanner();
    expect(screen.queryByTestId('explore-live-lobbies-banner')).not.toBeInTheDocument();
  });
});
