import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyGuestView, DebateLobbyMember, DebateLobbyView } from '../api';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  memberLobby: undefined as DebateLobbyView | undefined,
  guestView: undefined as DebateLobbyGuestView | undefined,
  presenceStatus: 'idle',
  start: vi.fn(),
  heartbeat: vi.fn(),
  leave: vi.fn(async () => undefined),
  onAudible: null as (() => void) | null,
  /** What the page asked presence to join with, render by render; only a member joins. */
  presenceAdmitted: [] as boolean[],
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  startDebateLobbyGuest: mocks.start,
  sendDebateLobbyGuestHeartbeat: mocks.heartbeat,
  leaveDebateLobbyGuest: mocks.leave,
}));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    accountKey: mocks.authenticated ? 'acct' : null,
    getPrivyIdentityToken: vi.fn(),
  }),
}));
vi.mock('./hooks', () => ({
  MAX_TIMEOUT_MS: 2_147_483_647,
  useDebateLobby: () => ({ data: mocks.memberLobby, isError: false }),
  useLobbyPresence: (_id: string, admitted: boolean) => {
    mocks.presenceAdmitted.push(admitted);
    return {
      state: { status: mocks.presenceStatus },
      join: vi.fn(),
      leave: vi.fn(),
      leaveSteppedOut: vi.fn(),
      connectionId: 'conn-1',
      setVoiceConnected: vi.fn(),
      voiceAwayAt: null,
    };
  },
  useDebateLobbyReminder: () => ({ mutate: vi.fn(), isPending: false }),
  useEndDebateLobby: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('./lobby-guest-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-guest-hooks')>()),
  useDebateLobbyGuestView: (_id: string, { enabled }: { enabled: boolean }) => ({
    data: enabled ? mocks.guestView : undefined,
    isError: false,
  }),
}));
vi.mock('./lobby-voice', async () => {
  const ReactModule = await import('react');
  const NO = { speaking: new Set(), micOn: new Set(), connected: false };
  const Context = ReactModule.createContext(NO);
  return {
    NO_LOBBY_VOICE: NO,
    LobbyVoiceStatesProvider: Context.Provider,
    useLobbyVoiceStates: () => ReactModule.useContext(Context),
    LobbyGuestVoice: ({ token, quiet }: { token: { token: string }; quiet?: boolean }) => (
      <div data-testid="guest-room" data-quiet={quiet ? 'yes' : 'no'}>
        {token.token}
      </div>
    ),
    LobbyVoice: ({ onAudible, children }: { onAudible?: () => void; children: React.ReactNode }) => {
      mocks.onAudible = onAudible ?? null;
      return <div data-testid="member-room">{children}</div>;
    },
  };
});
vi.mock('./lobby-claims-area', () => ({ LobbyClaimsArea: () => <div data-testid="claims" /> }));
vi.mock('./lobby-moderation', () => ({
  LobbyHostLists: () => null,
  LobbyHandControl: () => null,
  LobbyRemovedNotice: () => null,
  useModerationNotice: () => null,
}));
vi.mock('./lobby-member-actions', () => ({ LobbyMemberMenu: () => null }));
vi.mock('./lobby-request-debate', () => ({ LobbyRequestDebate: () => null }));
vi.mock('./lobby-people', () => ({ LobbyPersonName: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./lobby-queued-request', () => ({
  LOBBY_QUEUED_REQUEST_COPY: { prompt: (name: string) => `Create an account to request a debate with ${name}.` },
  LobbyQueuedRequestProvider: ({ children }: { children: React.ReactNode }) => children,
  useLobbyQueuedRequest: () => ({
    guest: false,
    pending: null,
    request: vi.fn(),
    outcome: null,
    dismissOutcome: vi.fn(),
  }),
}));
vi.mock('./lobby-guest-sign-in', () => ({ useLobbyGuestSignIn: () => vi.fn() }));
vi.mock('../matchmaking/hooks', () => ({ useMatchmakingScope: vi.fn() }));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => null }));

const { DebateLobbyPage, memberPath } = await import('./lobby-page');
const { readGuestSecret } = await import('./lobby-guest-secret');

const adam: DebateLobbyMember = {
  user_id: 'adam',
  profile_space_id: 'space-adam',
  display_name: 'Adam',
  avatar_cid: null,
  role: 'host',
  creator: true,
  acting_host: false,
  on_roster_since: '2026-10-09T10:00:00Z',
  stepped_out: false,
  in_debate: false,
};

const lobbyFields = {
  lobby_id: 'lobby1',
  name: 'Onboarding with Adam',
  access: { status: 'admitted' as const },
  starts_at: '2026-10-09T10:00:00Z',
  opens_at: '2026-10-09T10:00:00Z',
  scheduled: false,
  created_by: 'adam',
  acting_host_id: null,
  hosts_changed_at: null,
  reminder_count: 0,
  members: [adam],
  guest_count: 2,
};

const memberView: DebateLobbyView = {
  ...lobbyFields,
  viewer: {
    role: 'speaker',
    creator: false,
    hosting: false,
    reminded: false,
    voice_away_at: null,
    connected: true,
    stepped_out: false,
  },
};

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.authenticated = false;
  mocks.memberLobby = undefined;
  mocks.guestView = { lobby: lobbyFields, claims: null, highlights: null };
  mocks.presenceStatus = 'idle';
  mocks.onAudible = null;
  mocks.presenceAdmitted = [];
  mocks.start.mockReset().mockResolvedValue({
    guest_id: 'g1',
    guest_secret: 'secret-1',
    lease_expires_at: 'x',
    heartbeat_interval_seconds: 20,
    voice: {
      token: 'guest-jwt',
      url: 'wss://lk',
      room_name: 'r',
      can_publish: false,
      start_muted: false,
      expires_at: 'x',
    },
  });
  mocks.heartbeat.mockReset().mockResolvedValue({ alive: true, reason: null, lease_expires_at: 'x' });
  mocks.leave.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('DebateLobbyPage for a visitor without an account', () => {
  it('shows the room from the guest view and listens, with no member controls', async () => {
    render(<DebateLobbyPage lobbyId="lobby1" />);

    expect(screen.getByRole('heading', { name: 'Onboarding with Adam' })).toBeInTheDocument();
    expect(screen.getByText('You’re listening.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByTestId('claims')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leave lobby' })).toHaveAttribute(
      'href',
      expect.stringContaining('explore')
    );
    await screen.findByTestId('guest-room');
    expect(screen.getByText(/You and 1 other/)).toBeInTheDocument();
    expect(screen.queryByTestId('member-room')).not.toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledWith('lobby1', {});
    // No join, so no lobby_* analytics: those count members.
    expect(mocks.presenceAdmitted.every(admitted => !admitted)).toBe(true);
  });

  it('shows the removal and offers sign-in instead of listening again', async () => {
    const { GeoChatRequestError } = await import('../api');
    mocks.start.mockRejectedValue(new GeoChatRequestError('no', 'lobby_guest_removed', 403));
    render(<DebateLobbyPage lobbyId="lobby1" />);
    expect(await screen.findByText('A host removed you from this lobby.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByTestId('guest-room')).not.toBeInTheDocument();
  });

  // geo-chat's upgrade order: join (ends the guest), member token, member room up, then guest room down.
  it('keeps the guest room playing through sign-in until the member room is audible', async () => {
    const { rerender } = render(<DebateLobbyPage lobbyId="lobby1" />);
    await screen.findByTestId('guest-room');

    // Signed in; the member view is still loading (a new account takes a minute or two).
    mocks.authenticated = true;
    rerender(<DebateLobbyPage lobbyId="lobby1" />);
    expect(screen.getByTestId('guest-room')).toBeInTheDocument();
    expect(screen.getByText('Setting up your account…')).toBeInTheDocument();

    expect(mocks.presenceAdmitted.every(admitted => !admitted)).toBe(true);

    // The member view lands and the join goes out with the secret.
    mocks.memberLobby = memberView;
    mocks.presenceStatus = 'joining';
    rerender(<DebateLobbyPage lobbyId="lobby1" />);
    expect(mocks.presenceAdmitted.at(-1)).toBe(true);
    expect(screen.getByTestId('member-room')).toBeInTheDocument();
    expect(screen.getByTestId('guest-room')).toHaveAttribute('data-quiet', 'yes');
    expect(screen.queryByText('You’re listening.')).not.toBeInTheDocument();
    expect(readGuestSecret('lobby1')).toBe('secret-1');

    mocks.presenceStatus = 'joined';
    rerender(<DebateLobbyPage lobbyId="lobby1" />);
    expect(screen.getByTestId('guest-room')).toBeInTheDocument();

    // The member room connected with playback allowed: now the guest room goes.
    expect(mocks.onAudible).toEqual(expect.any(Function));
    act(() => mocks.onAudible?.());
    await waitFor(() => expect(screen.queryByTestId('guest-room')).not.toBeInTheDocument());
    expect(screen.getByTestId('member-room')).toBeInTheDocument();
    expect(readGuestSecret('lobby1')).toBeNull();
    // The join ended the guest session server-side, so no leave follows.
    cleanup();
    expect(mocks.leave).not.toHaveBeenCalled();
  });
});

describe('memberPath', () => {
  const loaded = { data: memberView, isError: false };
  const loading = { data: undefined, isError: false };

  it('waits while signed out, loading or joining', () => {
    expect(memberPath(false, loading, { status: 'idle' })).toBe('pending');
    expect(memberPath(true, loading, { status: 'idle' })).toBe('pending');
    expect(memberPath(true, loaded, { status: 'joining' })).toBe('pending');
  });

  it('is joined once presence says so', () => {
    expect(memberPath(true, loaded, { status: 'joined' })).toBe('joined');
  });

  it('fails when the member read fails, the lobby will not admit, or the join will not land', () => {
    expect(memberPath(true, { data: undefined, isError: true }, { status: 'idle' })).toBe('failed');
    expect(
      memberPath(true, { data: { ...memberView, access: { status: 'banned' } }, isError: false }, { status: 'idle' })
    ).toBe('failed');
    expect(memberPath(true, loaded, { status: 'confirm_leave_other', otherLobbyId: null })).toBe('failed');
    expect(memberPath(true, loaded, { status: 'failed', message: 'x' })).toBe('failed');
  });
});

describe('DebateLobbyPage after sign-in that does not join here', () => {
  it('leaves as a guest and drops the guest room', async () => {
    const { rerender } = render(<DebateLobbyPage lobbyId="lobby1" />);
    await screen.findByTestId('guest-room');

    mocks.authenticated = true;
    mocks.memberLobby = memberView;
    mocks.presenceStatus = 'confirm_leave_other';
    rerender(<DebateLobbyPage lobbyId="lobby1" />);

    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith('lobby1', { guest_secret: 'secret-1' }, true));
    expect(screen.queryByTestId('guest-room')).not.toBeInTheDocument();
    expect(readGuestSecret('lobby1')).toBeNull();
  });
});
