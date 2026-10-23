import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyRole, DebateLobbyView } from '../api';
import type { MemberLobbyPageView } from './lobby-view';

const api = vi.hoisted(() => ({
  moderateDebateLobbyMember: vi.fn(),
  setDebateLobbyHand: vi.fn(),
  getDebateLobbyBans: vi.fn(),
  getDebateLobbyModerationLog: vi.fn(),
  removeDebateLobbyGuests: vi.fn(),
}));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

const { GeoChatRequestError } = await import('../api');
const { LobbyMemberActions } = await import('./lobby-member-actions');
const { LobbyHostLists, LobbyRemovedNotice, useModerationNotice } = await import('./lobby-moderation');

function member(userId: string, role: DebateLobbyRole, extra: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    acting_host: false,
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: userId.toUpperCase(),
    avatar_cid: null,
    role,
    creator: false,
    on_roster_since: '2026-10-05T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    ...extra,
  };
}

function lobby(
  viewer: Partial<DebateLobbyView['viewer']> = {},
  extra: Partial<Omit<DebateLobbyView, 'viewer'>> = {}
): MemberLobbyPageView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access: { status: 'admitted' },
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    scheduled: false,
    created_by: 'host1',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [],
    viewer: {
      kind: 'member',
      role: 'host',
      creator: true,
      hosting: true,
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
      ...viewer,
    },
    ...extra,
  };
}

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const person = (id: string, name: string) => ({
  user_id: id,
  profile_space_id: `space-${id}`,
  display_name: name,
  avatar_cid: null,
});

beforeEach(() => {
  api.moderateDebateLobbyMember.mockResolvedValue(lobby());
  api.setDebateLobbyHand.mockResolvedValue(lobby());
  api.getDebateLobbyBans.mockResolvedValue({ banned: [] });
  api.getDebateLobbyModerationLog.mockResolvedValue({ entries: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('LobbyMemberActions', () => {
  it('runs an action on the member and reports done', async () => {
    const onDone = vi.fn();
    renderWith(<LobbyMemberActions lobby={lobby()} member={member('sam', 'speaker')} isSelf={false} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to listeners' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.moderateDebateLobbyMember).toHaveBeenCalledWith(
      'lobby1',
      'sam',
      'move-to-listeners',
      expect.any(Function),
      'acct'
    );
  });

  it('asks before banning', async () => {
    renderWith(<LobbyMemberActions lobby={lobby()} member={member('sam', 'speaker')} isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ban from lobby' }));
    expect(api.moderateDebateLobbyMember).not.toHaveBeenCalled();
    expect(screen.getByText(/Ban SAM\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    await waitFor(() =>
      expect(api.moderateDebateLobbyMember).toHaveBeenCalledWith('lobby1', 'sam', 'ban', expect.any(Function), 'acct')
    );
  });

  it('shows the server’s refusal', async () => {
    api.moderateDebateLobbyMember.mockRejectedValue(new GeoChatRequestError('raw', 'lobby_not_present', 409));
    renderWith(<LobbyMemberActions lobby={lobby()} member={member('sam', 'speaker')} isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from lobby' }));
    expect(await screen.findByText('Join the lobby to moderate.')).toBeTruthy();
  });

  it('hides Mute for a mic that is off', () => {
    renderWith(<LobbyMemberActions lobby={lobby()} member={member('sam', 'speaker')} isSelf={false} micOn={false} />);
    expect(screen.queryByRole('button', { name: 'Mute mic' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move to listeners' })).toBeTruthy();
  });

  it('renders nothing for a viewer who is not hosting', () => {
    renderWith(
      <LobbyMemberActions
        lobby={lobby({ role: 'speaker', hosting: false, creator: false })}
        member={member('sam', 'speaker')}
        isSelf={false}
      />
    );
    expect(screen.queryByTestId('lobby-member-actions')).toBeNull();
  });

  it('offers a host stepping down on their own row', () => {
    renderWith(<LobbyMemberActions lobby={lobby()} member={member('host1', 'host')} isSelf />);
    expect(screen.getAllByRole('button').map(item => item.textContent)).toEqual(['Step down as host']);
  });
});

describe('LobbyHostLists', () => {
  const banned = {
    banned: [
      {
        user: person('jo', 'Jordan'),
        role: 'speaker',
        banned_at: '2026-10-05T10:00:00Z',
        banned_by: person('host1', 'Adam'),
      },
    ],
  };

  it('lists raised hands oldest first with Move to speakers', async () => {
    const view = lobby(
      {},
      {
        members: [
          member('leo', 'listener', { hand_raised_at: '2026-10-05T10:02:00Z' }),
          member('sam', 'listener', { hand_raised_at: '2026-10-05T10:01:00Z' }),
        ],
      }
    );
    renderWith(<LobbyHostLists lobby={view} />);
    expect(screen.getByRole('button', { name: 'Raised hands · 2' })).toBeTruthy();
    expect(screen.getAllByText(/^Hand up /)).toHaveLength(2);
    const moves = screen.getAllByRole('button', { name: 'Move to speakers' });
    fireEvent.click(moves[0]!);
    await waitFor(() =>
      expect(api.moderateDebateLobbyMember).toHaveBeenCalledWith(
        'lobby1',
        'sam',
        'move-to-speakers',
        expect.any(Function),
        'acct'
      )
    );
  });

  it('says who moved a raised hand to listeners', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-05T10:02:00Z') });
    const view = lobby(
      {},
      {
        members: [
          member('sam', 'listener', {
            hand_raised_at: '2026-10-05T10:01:00Z',
            moved_to_listeners: { by: person('priya', 'Priya'), at: '2026-10-05T10:00:00Z' },
          }),
          member('leo', 'listener', {
            hand_raised_at: '2026-10-05T10:01:40Z',
            moved_to_listeners: { by: null, at: '2026-10-05T10:00:00Z' },
          }),
        ],
      }
    );
    renderWith(<LobbyHostLists lobby={view} />);
    expect(screen.getByText('Moved to listeners by Priya · hand up 1 min')).toBeTruthy();
    expect(screen.getByText('Moved to listeners · hand up 20 s')).toBeTruthy();
  });

  it('lets a host unban', async () => {
    api.getDebateLobbyBans.mockResolvedValue(banned);
    renderWith(<LobbyHostLists lobby={lobby()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banned · 1' }));
    expect(screen.getByText(/Banned by Adam/)).toBeTruthy();
    expect(
      screen.getByText('Bans apply to this lobby only. Guests without an account can be removed but not banned.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unban' }));
    await waitFor(() =>
      expect(api.moderateDebateLobbyMember).toHaveBeenCalledWith('lobby1', 'jo', 'unban', expect.any(Function), 'acct')
    );
  });

  it('shows the acting host the banned list without Unban', async () => {
    api.getDebateLobbyBans.mockResolvedValue(banned);
    renderWith(<LobbyHostLists lobby={lobby({ role: 'speaker', creator: false })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banned · 1' }));
    // The name opens the profile in the side panel; a link would leave the lobby.
    expect(screen.getByRole('button', { name: 'Jordan' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Jordan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unban' })).toBeNull();
  });

  it('keeps the banned list and log readable once the lobby has ended', async () => {
    api.getDebateLobbyBans.mockResolvedValue(banned);
    api.getDebateLobbyModerationLog.mockResolvedValue({
      entries: [
        {
          id: 1,
          action: 'ban',
          actor: person('host1', 'Adam'),
          target: person('jo', 'Jordan'),
          at: '2026-10-05T10:00:00Z',
        },
      ],
    });
    renderWith(
      <LobbyHostLists
        lobby={lobby({ hosting: false, connected: false }, { access: { status: 'closed', reason: 'ended' } })}
      />
    );
    expect(screen.queryByRole('button', { name: /Raised hands/ })).toBeNull();
    expect(await screen.findByText('Jordan')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unban' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByText('Adam banned Jordan')).toBeTruthy();
  });
});

describe('useModerationNotice', () => {
  const at = (iso: string, action: 'mute' | 'move_to_listeners' = 'mute') => ({ last_moderation: { action, at: iso } });

  it('says nothing about an action from before the page opened, then announces a newer one', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(viewer => useModerationNotice(viewer), {
      initialProps: at('2026-10-05T10:00:00Z') as Pick<DebateLobbyView['viewer'], 'last_moderation'>,
    });
    expect(result.current).toBeNull();

    rerender(at('2026-10-05T10:05:00Z', 'move_to_listeners'));
    expect(result.current).toMatch(/moved you to listeners/);

    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBeNull();
  });

  it('announces the first action when the page opened with none', () => {
    const { result, rerender } = renderHook(viewer => useModerationNotice(viewer), {
      initialProps: { last_moderation: null } as Pick<DebateLobbyView['viewer'], 'last_moderation'>,
    });
    rerender(at('2026-10-05T10:05:00Z'));
    expect(result.current).toBe('A host muted you. Unmute when you’re ready.');
  });
});

describe('LobbyRemovedNotice', () => {
  it('says the viewer was removed, and Rejoin comes back', () => {
    const onRejoin = vi.fn();
    renderWith(<LobbyRemovedNotice onRejoin={onRejoin} />);
    expect(screen.getByText('A host removed you from this lobby')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoin' }));
    expect(onRejoin).toHaveBeenCalledTimes(1);
  });

  it('says the ban was lifted after an unban', () => {
    renderWith(<LobbyRemovedNotice onRejoin={vi.fn()} unbanned />);
    expect(screen.getByText('A host lifted your ban')).toBeTruthy();
    expect(screen.getByText('Rejoin to come back.')).toBeTruthy();
    expect(screen.queryByText('A host removed you from this lobby')).toBeNull();
  });
});

describe('Remove guests', () => {
  it('removes every guest after an in-page confirmation', async () => {
    api.removeDebateLobbyGuests.mockResolvedValue(lobby({}, { guest_count: 0 }));
    renderWith(<LobbyHostLists lobby={lobby({}, { guest_count: 3 })} />);

    expect(screen.getByText('3 guests without an account')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove guests' }));
    expect(screen.getByText(/Remove all 3 guests without an account\?/)).toBeTruthy();
    expect(api.removeDebateLobbyGuests).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove guests' }));
    await waitFor(() =>
      expect(api.removeDebateLobbyGuests).toHaveBeenCalledWith('lobby1', expect.any(Function), 'acct')
    );
    await waitFor(() => expect(screen.queryByText(/Remove all 3 guests/)).toBeNull());
  });

  it('is only for whoever is hosting, with guests to remove', () => {
    renderWith(<LobbyHostLists lobby={lobby({}, { guest_count: 0 })} />);
    expect(screen.queryByTestId('lobby-remove-guests')).toBeNull();
    cleanup();
    renderWith(<LobbyHostLists lobby={lobby({ hosting: false, role: 'host' }, { guest_count: 2 })} />);
    expect(screen.queryByTestId('lobby-remove-guests')).toBeNull();
  });
});
