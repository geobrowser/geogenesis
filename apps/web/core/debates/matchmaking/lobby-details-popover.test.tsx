import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

// The lobby's own read, for what the list row leaves out (GEO-3463 details).
const lobbyView = vi.hoisted(() => ({ data: undefined as unknown, refetch: vi.fn() }));
/** What every view carries that these tests do not look at: a viewer who does not host it. */
const VIEW_BASE = {
  purpose: 'lobby',
  access: { status: 'not_yet_open', opens_at: '2026-10-30T18:50:00Z' },
  viewer: { role: null, hosting: false },
};
const HOST_VIEW = { ...VIEW_BASE, viewer: { role: 'host', hosting: false }, reminder_count: 0, going: [] };
// The view read for a lobby carries that lobby's id, as geo-chat's does.
const useDebateLobby = vi.hoisted(() =>
  vi.fn((lobbyId: string) => ({
    ...lobbyView,
    data: lobbyView.data && { ...(lobbyView.data as object), lobby_id: lobbyId },
  }))
);
const useUpdateDebateLobby = vi.hoisted(() =>
  vi.fn((_lobbyId: string) => ({ mutate: vi.fn(), error: null, isPending: false }))
);
vi.mock('../lobbies/hooks', () => ({ useDebateLobby, useUpdateDebateLobby }));
vi.mock('../lobbies/lobby-host-lobbies', () => ({
  usePreOpenHosts: (lobby: { hosts?: unknown[] }) => lobby.hosts ?? [],
}));
vi.mock('../lobbies/lobby-claim-list-tab', () => ({
  useClaimListName: (list: { entity_id: string }) => `List ${list.entity_id}`,
}));

window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { LobbyDetailsPopover } = await import('./lobby-details-popover');

function lobby(overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary {
  return {
    lobby_id: 'lobby1',
    name: 'NYC Debates',
    scheduled: true,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    opens_at: new Date(Date.now() + 86_400_000).toISOString(),
    open: false,
    hosts: [],
    headcount: 0,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_on_roster: false,
    ...overrides,
  };
}

/** The name as the timeline row draws it, with a stand-in for the row's RSVP. */
function Details({ lobby }: { lobby: DebateLobbySummary }) {
  return (
    <LobbyDetailsPopover lobby={lobby} now={Date.now()} rsvp={<button type="button">RSVP</button>}>
      {lobby.name}
    </LobbyDetailsPopover>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  lobbyView.data = undefined;
});

describe('LobbyDetailsPopover', () => {
  it('opens the lobby’s details from its name: full name, hosts, who is going and its claim lists', () => {
    const host = { user_id: 'host-1', profile_space_id: 'space-host', display_name: 'Bryan', avatar_cid: null };
    const person = (id: string, name: string) => ({
      user_id: id,
      profile_space_id: `space-${id}`,
      display_name: name,
      avatar_cid: null,
    });
    lobbyView.data = {
      ...VIEW_BASE,
      name: 'Geo Open Debates - Politics and Policy Night',
      hosts: [host],
      reminder_count: 14,
      going: [person('a', 'Ana'), person('b', 'Ben')],
      claim_lists: [{ entity_id: 'page-1', space_id: 'space-1', position: 0, added_by: null, added_at: '' }],
    };
    const later = lobby({ open: false, scheduled: true, name: 'Geo Open Debates - Pol…', reminder_count: 14 });
    render(<Details lobby={later} />);

    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    const details = screen.getByRole('dialog', { name: 'Lobby details' });

    expect(details).toHaveTextContent('Geo Open Debates - Politics and Policy Night');
    expect(details).toHaveTextContent('Hosted by Bryan');
    expect(details).toHaveTextContent('Ana, Ben and 12 more going');
    expect(details).toHaveTextContent('List page-1');
    expect(within(details).getByRole('link', { name: 'Open lobby page' })).toHaveAttribute('href', '/debate/lobby1');
    // Not this viewer's lobby: nothing to edit, and the going row is only a summary.
    expect(within(details).queryByRole('button', { name: 'Edit' })).toBeNull();
    lobbyView.data = undefined;
  });

  // GEO-3540: a host edits the lobby from its details.
  it('offers a host Edit in the lobby’s details', () => {
    lobbyView.data = HOST_VIEW;
    render(<Details lobby={lobby()} />);

    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    const details = screen.getByRole('dialog', { name: 'Lobby details' });
    expect(within(details).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  // The dialog is drawn beside the details, so Escape in it leaves the panel alone and the details
  // closing can't take it with them.
  it('closes the details before showing the edit dialog', async () => {
    lobbyView.data = HOST_VIEW;
    render(<Details lobby={lobby()} />);
    // Nothing reads the lobby (or schedules its refetch at opening) until it's wanted.
    expect(useDebateLobby).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Lobby details' })).getByRole('button', { name: 'Edit' })
    );

    expect(await screen.findByRole('dialog', { name: 'Edit lobby' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Lobby details' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Edit lobby' })).toBeNull();
  });

  // The caller can hand the same popover another lobby mid-edit.
  it('keeps an edit on the lobby it began on', async () => {
    lobbyView.data = HOST_VIEW;
    const { rerender } = render(<Details lobby={lobby({ lobby_id: 'lobby-a' })} />);
    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Lobby details' })).getByRole('button', { name: 'Edit' })
    );
    await screen.findByRole('dialog', { name: 'Edit lobby' });

    useUpdateDebateLobby.mockClear();
    rerender(<Details lobby={lobby({ lobby_id: 'lobby-b' })} />);

    expect(screen.getByRole('dialog', { name: 'Edit lobby' })).toBeInTheDocument();
    expect(useUpdateDebateLobby.mock.calls.map(([id]) => id)).not.toContain('lobby-b');
    expect(useUpdateDebateLobby).toHaveBeenLastCalledWith('lobby-a');
  });

  // Review, 27 Oct: someone else's RSVP reaches this viewer only as the list row's count, and the
  // details kept the view's older count and names.
  it('keeps the details’ going count live, and reads the names again when it moves', () => {
    const person = (id: string, name: string) => ({
      user_id: id,
      profile_space_id: `space-${id}`,
      display_name: name,
      avatar_cid: null,
    });
    lobbyView.data = { ...VIEW_BASE, reminder_count: 2, going: [person('a', 'Ana'), person('b', 'Ben')] };
    const later = (count: number) => lobby({ open: false, scheduled: true, reminder_count: count });
    const { rerender } = render(<Details lobby={later(2)} />);
    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    expect(screen.getByTestId('lobby-going')).toHaveTextContent('Ana and Ben going');
    // Once for opening (see the next case), and not again until the count moves.
    expect(lobbyView.refetch).toHaveBeenCalledTimes(1);

    rerender(<Details lobby={later(3)} />);

    expect(screen.getByTestId('lobby-going')).toHaveTextContent('Ana, Ben and 1 more going');
    expect(lobbyView.refetch).toHaveBeenCalledTimes(2);
    lobbyView.data = undefined;
  });

  // Review, 27 Oct: one RSVP cleared and another set inside the 3s broadcast window leave the count
  // where it was, so a held view kept naming the person who left. Opening reads it again.
  it('reads the names again each time the details open', async () => {
    lobbyView.data = { ...VIEW_BASE, reminder_count: 1, going: [] };
    render(<Details lobby={lobby({ open: false, scheduled: true, reminder_count: 1 })} />);
    const trigger = screen.getByRole('button', { name: /lobby details/ });

    fireEvent.click(trigger);
    expect(lobbyView.refetch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Lobby details' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lobby details' })).not.toBeInTheDocument());

    fireEvent.click(trigger);
    expect(lobbyView.refetch).toHaveBeenCalledTimes(2);
    lobbyView.data = undefined;
  });

  // With nothing held, the query's own first read is the one out; a refetch would only restart it.
  it('leaves a first read alone when the details open', () => {
    lobbyView.data = undefined;
    render(<Details lobby={lobby({ open: false, scheduled: true, reminder_count: 1 })} />);

    fireEvent.click(screen.getByRole('button', { name: /lobby details/ }));
    expect(lobbyView.refetch).not.toHaveBeenCalled();
  });
});
