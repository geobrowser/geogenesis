import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { ConnectionState, DisconnectReason } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyVoiceToken } from '../api';
import type { MemberLobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  getDebateLobbyVoiceToken: vi.fn(),
  acquired: true,
  roomProps: null as Record<string, unknown> | null,
  connectionState: 'connected',
  canPlayAudio: true,
  startAudio: vi.fn(),
  isMicrophoneEnabled: false,
  setMicrophoneEnabled: vi.fn(async () => undefined),
  participants: [] as { identity: string; isMicrophoneEnabled: boolean; isSpeaking: boolean }[],
  permissions: undefined as { canPublish: boolean } | undefined,
  /** Local participant listeners, by event name. */
  listeners: new Map<string, (...args: unknown[]) => void>(),
  /** Room event listeners, by event name; `emitRoom` plays connection states. */
  roomListeners: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

const fakeRoom = {
  state: 'disconnected',
  on: (event: string, listener: (...args: unknown[]) => void) => {
    mocks.roomListeners.set(event, (mocks.roomListeners.get(event) ?? new Set()).add(listener));
    return fakeRoom;
  },
  off: (event: string, listener: (...args: unknown[]) => void) => {
    mocks.roomListeners.get(event)?.delete(listener);
    return fakeRoom;
  },
};

/** Plays connection states, then a `Disconnected` reason when given; LiveKit sends the reason after the state. */
async function emitRoom(states: string[], disconnectReason?: number) {
  await act(async () => {
    for (const state of states) mocks.roomListeners.get('connectionStateChanged')?.forEach(listener => listener(state));
    if (disconnectReason !== undefined) {
      mocks.roomListeners.get('disconnected')?.forEach(listener => listener(disconnectReason));
    }
    await Promise.resolve();
  });
}

const localParticipant = {
  setMicrophoneEnabled: mocks.setMicrophoneEnabled,
  on: (event: string, listener: (...args: unknown[]) => void) => mocks.listeners.set(event, listener),
  off: (event: string) => mocks.listeners.delete(event),
};

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getDebateLobbyVoiceToken: mocks.getDebateLobbyVoiceToken,
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('../debate-room-ownership', () => ({
  createDebateRoomOwnershipCoordinator: () => ({
    acquire: async () => ({ acquired: mocks.acquired, waitedForLocalRelease: false }),
    requestTakeover: async () => false,
    release: async () => undefined,
    close: () => undefined,
  }),
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    mocks.roomProps = props;
    return <>{props.children}</>;
  },
  RoomAudioRenderer: () => null,
  useRoomContext: () => fakeRoom,
  useConnectionState: () => mocks.connectionState,
  useAudioPlayback: () => ({ canPlayAudio: mocks.canPlayAudio, startAudio: mocks.startAudio }),
  useLocalParticipant: () => ({ localParticipant, isMicrophoneEnabled: mocks.isMicrophoneEnabled }),
  useLocalParticipantPermissions: () => mocks.permissions,
  useParticipants: () => mocks.participants,
}));

const { GeoChatRequestError } = await import('../api');
const { LobbyGuestVoice, LobbyVoice, useLobbyVoiceStates } = await import('./lobby-voice');

function lobby(role: 'host' | 'speaker' | 'listener' = 'speaker'): MemberLobbyPageView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access: { status: 'admitted' },
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    scheduled: false,
    created_by: 'u1',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [],
    viewer: {
      kind: 'member',
      role,
      creator: false,
      hosting: role === 'host',
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
    },
  };
}

function token(overrides: Partial<DebateLobbyVoiceToken> = {}): DebateLobbyVoiceToken {
  return {
    token: 'jwt',
    url: 'wss://livekit.test',
    room_name: 'geo-lobby-x',
    can_publish: true,
    start_muted: false,
    expires_at: '2026-10-06T12:10:00Z',
    ...overrides,
  };
}

function Speaking() {
  const { speaking, micOn } = useLobbyVoiceStates();
  return <p data-testid="states">{`speaking:${[...speaking].join(',')} mic:${[...micOn].join(',')}`}</p>;
}

function renderVoice(view = lobby(), onConnectedChange = vi.fn(), joined = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (isJoined: boolean) => (
    <QueryClientProvider client={client}>
      <LobbyVoice
        lobby={view}
        connectionId="conn-1"
        joined={isJoined}
        currentUserId="u1"
        onConnectedChange={onConnectedChange}
      >
        <Speaking />
      </LobbyVoice>
    </QueryClientProvider>
  );
  const result = render(ui(joined));
  return { ...result, setJoined: (next: boolean) => result.rerender(ui(next)) };
}

beforeEach(() => {
  mocks.acquired = true;
  mocks.roomProps = null;
  mocks.connectionState = ConnectionState.Connected;
  mocks.canPlayAudio = true;
  mocks.isMicrophoneEnabled = false;
  mocks.participants = [];
  mocks.permissions = undefined;
  mocks.getDebateLobbyVoiceToken.mockResolvedValue(token());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.roomListeners.clear();
});

describe('LobbyVoice', () => {
  it('mints with this tab’s connection and joins with the mic on', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledWith(
      'lobby1',
      { connection_id: 'conn-1' },
      expect.any(Function),
      'acct'
    );
    expect(mocks.roomProps).toMatchObject({ token: 'jwt', serverUrl: 'wss://livekit.test', audio: true });
  });

  it('honours start_muted and unmutes on the button', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ start_muted: true }));
    renderVoice();
    const unmute = await screen.findByRole('button', { name: /Unmute/ });
    expect(mocks.roomProps).toMatchObject({ audio: false });
    fireEvent.click(unmute);
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    // Kept for the next connect, so a reconnect does not undo the choice.
    expect(mocks.roomProps).toMatchObject({ audio: true });
  });

  it('gives a listener no mic', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false }));
    renderVoice(lobby('listener'));
    expect(await screen.findByText('You’re listening')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull();
    expect(mocks.roomProps).toMatchObject({ audio: false });
  });

  // GEO-3134: LiveKit revokes publishing before the refetch brings the listener role.
  it('takes the mic down when a host moves the viewer to listeners', async () => {
    const { setJoined } = renderVoice();
    await screen.findByRole('button', { name: /mute/i });
    expect(mocks.roomProps).toMatchObject({ audio: true });

    mocks.permissions = { canPublish: false };
    setJoined(true);
    expect(await screen.findByText('You’re listening')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull();
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  // GEO-3134: Move to speakers and Make host mint a publishing token; the mic stays off until a click.
  it.each(['speaker', 'host'] as const)('starts muted after a listener becomes a %s', async role => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (view: MemberLobbyPageView) => (
      <QueryClientProvider client={client}>
        <LobbyVoice lobby={view} connectionId="conn-1" joined currentUserId="u1" onConnectedChange={vi.fn()}>
          <Speaking />
        </LobbyVoice>
      </QueryClientProvider>
    );
    const { rerender } = render(ui(lobby('listener')));
    await screen.findByText('You’re listening');

    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: true, start_muted: false }));
    rerender(ui(lobby(role)));
    await screen.findByRole('button', { name: /Unmute/ });
    expect(mocks.roomProps).toMatchObject({ audio: false });
  });

  it('remembers a host’s mute so a reconnect does not unmute', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /mute/i });
    expect(mocks.roomProps).toMatchObject({ audio: true });
    act(() => mocks.listeners.get('trackMuted')?.({ source: 'microphone' }));
    expect(mocks.roomProps).toMatchObject({ audio: false });
  });

  it('says voice is unavailable on a 503 and offers to try again', async () => {
    mocks.getDebateLobbyVoiceToken.mockRejectedValue(new GeoChatRequestError('raw', 'voice_capacity_reached', 503));
    renderVoice();
    expect(await screen.findByText('Voice is busy right now. Try again in a minute.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(mocks.roomProps).toBeNull();
    // The roster still renders.
    expect(screen.getByTestId('states')).toBeTruthy();
  });

  // Tokens live 60s and count against the caps until used, so a full reconnect mints anew.
  it('mints a new token for Try again rather than reusing one', async () => {
    mocks.getDebateLobbyVoiceToken.mockRejectedValueOnce(new GeoChatRequestError('raw', 'voice_unavailable', 503));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: /mute/i });
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(2);
  });

  // Another of the viewer's connections makes `viewer.connected` true before this tab's join lands;
  // a mint then would be refused for this connection.
  it('waits for this tab’s own join before minting', async () => {
    const { setJoined } = renderVoice(lobby(), vi.fn(), false);
    await screen.findByText('Connecting voice…');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mocks.getDebateLobbyVoiceToken).not.toHaveBeenCalled();

    setJoined(true);
    await screen.findByRole('button', { name: /mute/i });
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);
  });

  it('keeps the room through a lapse’s rejoin without minting again', async () => {
    const { setJoined } = renderVoice();
    await screen.findByRole('button', { name: /mute/i });
    setJoined(false);
    setJoined(true);
    await screen.findByRole('button', { name: /mute/i });
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);
  });

  // The mic is published before Connected, so its refusal reaches `onError` mid-connect.
  it('keeps the room for listening when the mic is blocked, and lets Unmute try again', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /mute/i });
    const blocked = new DOMException('Permission denied', 'NotAllowedError');
    act(() => (mocks.roomProps!.onError as (error: Error) => void)(blocked));

    expect(await screen.findByText('Your microphone isn’t available.')).toBeTruthy();
    expect(screen.queryByText('Voice could not connect.')).toBeNull();
    expect(mocks.roomProps).toMatchObject({ audio: false });

    fireEvent.click(screen.getByRole('button', { name: /Unmute/ }));
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(mocks.roomProps).toMatchObject({ audio: true });
  });

  it('still fails the connection on a connection error', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /mute/i });
    const failed = Object.assign(new Error('could not establish signal connection'), { name: 'ConnectionError' });
    act(() => (mocks.roomProps!.onError as (error: Error) => void)(failed));
    expect(await screen.findByText('Voice could not connect.')).toBeTruthy();
  });

  it('asks before taking voice from another tab', async () => {
    mocks.acquired = false;
    renderVoice();
    expect(await screen.findByText('Voice is on in another tab')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use voice here' })).toBeTruthy();
    expect(mocks.getDebateLobbyVoiceToken).not.toHaveBeenCalled();
  });

  it('asks for a tap where autoplay is blocked', async () => {
    mocks.canPlayAudio = false;
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Join audio' }));
    expect(mocks.startAudio).toHaveBeenCalled();
  });

  it('says it is reconnecting', async () => {
    mocks.connectionState = ConnectionState.Reconnecting;
    renderVoice();
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();
  });

  it('hands the roster who is speaking and whose mic is on, by dashless id', async () => {
    mocks.participants = [
      { identity: 'AA-BB', isMicrophoneEnabled: true, isSpeaking: true },
      { identity: 'ccdd', isMicrophoneEnabled: true, isSpeaking: false },
      { identity: 'eeff', isMicrophoneEnabled: false, isSpeaking: true },
    ];
    const onConnectedChange = vi.fn();
    renderVoice(lobby(), onConnectedChange);
    await waitFor(() => expect(screen.getByTestId('states').textContent).toBe('speaking:aabb mic:aabb,ccdd'));
    expect(onConnectedChange).toHaveBeenCalledWith(true);
  });
});

describe('LobbyVoice handover signal', () => {
  it('says the member room is audible only once connected with playback allowed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onAudible = vi.fn();
    mocks.canPlayAudio = false;
    const ui = () => (
      <QueryClientProvider client={client}>
        <LobbyVoice
          lobby={lobby()}
          connectionId="conn-1"
          joined
          currentUserId="u1"
          onConnectedChange={vi.fn()}
          onAudible={onAudible}
        >
          <Speaking />
        </LobbyVoice>
      </QueryClientProvider>
    );
    const { rerender } = render(ui());
    await screen.findByRole('button', { name: 'Join audio' });
    expect(onAudible).not.toHaveBeenCalled();

    mocks.canPlayAudio = true;
    rerender(ui());
    await waitFor(() => expect(onAudible).toHaveBeenCalled());
  });
});

describe('LobbyVoice unavailable signal', () => {
  it('says so when the member token is refused, so a playing guest room can go', async () => {
    mocks.getDebateLobbyVoiceToken.mockRejectedValue(new GeoChatRequestError('full', 'lobby_voice_full', 409));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onUnavailable = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <LobbyVoice
          lobby={lobby()}
          connectionId="conn-1"
          joined
          currentUserId="u1"
          onConnectedChange={vi.fn()}
          onUnavailable={onUnavailable}
        >
          <Speaking />
        </LobbyVoice>
      </QueryClientProvider>
    );
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });
});

describe('LobbyGuestVoice', () => {
  const guestToken = token({ can_publish: false, token: 'guest-jwt' });

  it('listens only: no mic, and says so', () => {
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    expect(mocks.roomProps).toMatchObject({ token: 'guest-jwt', audio: false, video: false });
    expect(screen.getByText('Listening only. Your mic is off until you have an account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mute|Unmute/ })).not.toBeInTheDocument();
  });

  // iOS: one tap to start audio.
  it('asks for a tap when playback is blocked', () => {
    mocks.canPlayAudio = false;
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join audio' }));
    expect(mocks.startAudio).toHaveBeenCalled();
  });

  it('reports who is speaking for the roster, and clears it when dropped', async () => {
    mocks.participants = [{ identity: 'U-2', isMicrophoneEnabled: true, isSpeaking: true }];
    const onStates = vi.fn();
    const { unmount } = render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={onStates}
        onReconnect={vi.fn()}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(onStates).toHaveBeenLastCalledWith(expect.objectContaining({ connected: true, speaking: new Set(['u2']) }))
    );
    unmount();
    expect(onStates).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));
  });

  it('draws no bar while the member room takes over', () => {
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
        quiet
      />
    );
    expect(screen.queryByText(/Listening only/)).not.toBeInTheDocument();
    expect(mocks.roomProps).toMatchObject({ token: 'guest-jwt' });
  });

  it('reconnects with a fresh token after giving up', async () => {
    const onReconnect = vi.fn();
    const { rerender } = render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={onReconnect}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    mocks.connectionState = ConnectionState.Disconnected;
    rerender(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={onReconnect}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(onReconnect).toHaveBeenCalled();
  });
});

// A join dropped before it ever connected otherwise reads "Connecting…" for good.
describe('a join that never connects', () => {
  const guestToken = token({ can_publish: false, token: 'guest-jwt' });

  it('guest: asks the page for its one automatic reconnect', async () => {
    mocks.connectionState = ConnectionState.Connecting;
    const onAutoReconnect = vi.fn(() => true);
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={onAutoReconnect}
        onRemoved={vi.fn()}
      />
    );
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected]);
    expect(onAutoReconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Voice could not connect.')).not.toBeInTheDocument();
  });

  it('guest: with the retry spent, says so and offers Try again', async () => {
    const onReconnect = vi.fn();
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={onReconnect}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected]);
    expect(screen.getByText('Voice could not connect.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('guest: a drop after connecting is a disconnect, not a failed join', async () => {
    const onAutoReconnect = vi.fn(() => true);
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={onAutoReconnect}
        onRemoved={vi.fn()}
      />
    );
    await emitRoom([ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Disconnected]);
    expect(onAutoReconnect).not.toHaveBeenCalled();
  });

  it('member: retries once with a fresh token, then says it could not connect', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);

    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected]);
    await waitFor(() => expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: /Unmute|Mute/ });

    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected]);
    expect(await screen.findByText('Voice could not connect.')).toBeInTheDocument();
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(2);
  });
});

// A host's removal or the server's sweep disconnects the identity (PARTICIPANT_REMOVED). The page
// must not reconnect by itself; its heartbeat says why.
describe('a room the server removed', () => {
  const guestToken = token({ can_publish: false, token: 'guest-jwt' });

  it('guest, removed after connecting: says disconnected with no Try again, and asks the page', async () => {
    const onRemoved = vi.fn();
    const onAutoReconnect = vi.fn(() => true);
    const onReconnect = vi.fn();
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={onReconnect}
        onAutoReconnect={onAutoReconnect}
        onRemoved={onRemoved}
      />
    );
    mocks.connectionState = ConnectionState.Disconnected;
    await emitRoom(
      [ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Disconnected],
      DisconnectReason.PARTICIPANT_REMOVED
    );
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onAutoReconnect).not.toHaveBeenCalled();
    expect(screen.getByText('Voice disconnected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('guest, removed before connecting: not a failed join, so no automatic reconnect', async () => {
    const onRemoved = vi.fn();
    const onAutoReconnect = vi.fn(() => true);
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={onAutoReconnect}
        onRemoved={onRemoved}
      />
    );
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected], DisconnectReason.PARTICIPANT_REMOVED);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onAutoReconnect).not.toHaveBeenCalled();
    expect(screen.queryByText('Voice could not connect.')).not.toBeInTheDocument();
  });

  it('guest: any other drop before connecting is still a failed join', async () => {
    const onAutoReconnect = vi.fn(() => true);
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={onAutoReconnect}
        onRemoved={vi.fn()}
      />
    );
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected], DisconnectReason.JOIN_FAILURE);
    expect(onAutoReconnect).toHaveBeenCalledTimes(1);
  });

  it('member, removed before connecting: no fresh token', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected], DisconnectReason.PARTICIPANT_REMOVED);
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Voice could not connect.')).not.toBeInTheDocument();
  });
});

// Members replace each other across tabs and devices through LiveKit's duplicate identity, and the
// guest identity is stable per session, so a reload or second tab replaces the first the same way.
describe('a room another tab or device took over', () => {
  const guestToken = token({ can_publish: false, token: 'guest-jwt' });

  it('guest: no automatic reconnect and no Try again; the page asks the session', async () => {
    const onRemoved = vi.fn();
    const onAutoReconnect = vi.fn(() => true);
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={vi.fn()}
        onReconnect={vi.fn()}
        onAutoReconnect={onAutoReconnect}
        onRemoved={onRemoved}
      />
    );
    mocks.connectionState = ConnectionState.Disconnected;
    await emitRoom(
      [ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Disconnected],
      DisconnectReason.DUPLICATE_IDENTITY
    );
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onAutoReconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('member: says voice is on in another tab and fetches no token by itself', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    await emitRoom(
      [ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Disconnected],
      DisconnectReason.DUPLICATE_IDENTITY
    );
    expect(await screen.findByText('Voice is on in another tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use voice here' })).toBeInTheDocument();
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);
  });

  it('member: replaced before connecting is not a failed join either', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    await emitRoom([ConnectionState.Connecting, ConnectionState.Disconnected], DisconnectReason.DUPLICATE_IDENTITY);
    expect(await screen.findByText('Voice is on in another tab')).toBeInTheDocument();
    expect(mocks.getDebateLobbyVoiceToken).toHaveBeenCalledTimes(1);
  });

  it('member: a host’s removal does not read as another tab', async () => {
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    await emitRoom(
      [ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Disconnected],
      DisconnectReason.PARTICIPANT_REMOVED
    );
    expect(screen.queryByText('Voice is on in another tab')).not.toBeInTheDocument();
  });
});
