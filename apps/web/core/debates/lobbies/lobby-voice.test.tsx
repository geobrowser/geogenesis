import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { ConnectionState } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView, DebateLobbyVoiceToken } from '../api';

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
}));

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
  useRoomContext: () => ({}),
  useConnectionState: () => mocks.connectionState,
  useAudioPlayback: () => ({ canPlayAudio: mocks.canPlayAudio, startAudio: mocks.startAudio }),
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: mocks.setMicrophoneEnabled },
    isMicrophoneEnabled: mocks.isMicrophoneEnabled,
  }),
  useParticipants: () => mocks.participants,
}));

const { GeoChatRequestError } = await import('../api');
const { LobbyVoice, useLobbyVoiceStates } = await import('./lobby-voice');

function lobby(role: 'host' | 'speaker' | 'listener' = 'speaker'): DebateLobbyView {
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
    viewer: { role, creator: false, hosting: role === 'host', reminded: false, voice_away_at: null, present: true },
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

function renderVoice(view = lobby(), onConnectedChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LobbyVoice lobby={view} connectionId="conn-1" currentUserId="u1" onConnectedChange={onConnectedChange}>
        <Speaking />
      </LobbyVoice>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.acquired = true;
  mocks.roomProps = null;
  mocks.connectionState = ConnectionState.Connected;
  mocks.canPlayAudio = true;
  mocks.isMicrophoneEnabled = false;
  mocks.participants = [];
  mocks.getDebateLobbyVoiceToken.mockResolvedValue(token());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
