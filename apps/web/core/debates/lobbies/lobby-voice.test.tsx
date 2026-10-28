import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { ConnectionState, DisconnectReason } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyVoiceToken } from '../api';
import type { MemberLobbyPageView } from './lobby-view';
import {
  type LobbyCapture,
  carryLobbyJoinChoice,
  clearCarriedLobbyChoice,
  forgetLobbyDevices,
  lobbyCaptureLive,
  readCarriedLobbyChoice,
  registerLobbyStepOut,
  releaseLobbyCapture,
  routeIntoDebate,
  useLobbyCapture,
} from './step-out';

const mocks = vi.hoisted(() => ({
  getDebateLobbyVoiceToken: vi.fn(),
  acquired: true,
  requestTakeover: false,
  /** The surface the owning tab says holds voice when it refuses. */
  refusedBy: undefined as string | undefined,
  roomProps: null as Record<string, unknown> | null,
  connectionState: 'connected',
  canPlayAudio: true,
  startAudio: vi.fn(),
  isMicrophoneEnabled: false,
  setMicrophoneEnabled: vi.fn(async () => undefined),
  setScreenShareEnabled: vi.fn(async (_enabled: boolean, _options?: unknown) => undefined),
  /** getUserMedia for the camera: a fresh track each time unless a test holds it back. */
  createTracks: vi.fn(async (_options: unknown): Promise<CameraTrack[]> => [cameraTrack()]),
  /** Every camera track acquired, oldest first. */
  created: [] as CameraTrack[],
  publishTrack: vi.fn(async (track: CameraTrack) => {
    mocks.published.add(track);
  }),
  // As LiveKit's, waits out a publish of the track still in flight.
  unpublishTrack: vi.fn(async (track: unknown) => {
    await mocks.publishing.get(track as CameraTrack);
    mocks.published.delete(track as CameraTrack);
  }),
  publishing: new Map<CameraTrack, Promise<void>>(),
  /** Camera tracks published and not yet unpublished. */
  published: new Set<CameraTrack>(),
  microphoneTrack: undefined as { track: object } | undefined,
  cameraTracks: [] as { participant: { identity: string }; publication: { track: object | null; isMuted: boolean } }[],
  participants: [] as { identity: string; isMicrophoneEnabled: boolean; isSpeaking: boolean }[],
  permissions: undefined as { canPublish: boolean } | undefined,
  /** Local participant listeners, by event name. */
  listeners: new Map<string, (...args: unknown[]) => void>(),
  /** Room event listeners, by event name; `emitRoom` plays connection states. */
  roomListeners: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

type CameraTrack = { stop: ReturnType<typeof vi.fn> };
function cameraTrack(): CameraTrack {
  const track = { stop: vi.fn() };
  mocks.created.push(track);
  return track;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Holds the next camera acquisition until `resolve` hands it its track. */
function holdCameraAcquisition() {
  const pending = deferred<CameraTrack[]>();
  mocks.createTracks.mockImplementationOnce(() => pending.promise);
  const track = cameraTrack();
  return { track, resolve: async () => act(async () => pending.resolve([track])) };
}

/** Holds the next camera publish until `resolve`. */
function holdCameraPublish() {
  const pending = deferred<void>();
  mocks.publishTrack.mockImplementationOnce(track => {
    const publishing = pending.promise.then(() => {
      mocks.published.add(track);
    });
    mocks.publishing.set(track, publishing);
    return publishing;
  });
  return { resolve: async () => act(async () => pending.resolve()) };
}

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
  setScreenShareEnabled: mocks.setScreenShareEnabled,
  createTracks: mocks.createTracks,
  publishTrack: mocks.publishTrack,
  unpublishTrack: mocks.unpublishTrack,
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

// The tab's voice lock: `acquired` is a free lock, `requestTakeover` another tab handing it over.
vi.mock('../debate-room-ownership', async importOriginal => ({
  ...(await importOriginal<typeof import('../debate-room-ownership')>()),
  createDebateRoomOwnershipCoordinator: () => {
    let owned = false;
    return {
      coordinationMode: 'lock-and-broadcast',
      requestTakeover: async () => (owned = mocks.acquired || mocks.requestTakeover),
      release: async () => undefined,
      close: () => undefined,
      ownsConnection: () => owned,
      lastRefusedBy: () => (owned ? undefined : mocks.refusedBy),
    };
  },
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
  useLocalParticipant: () => ({
    localParticipant,
    isMicrophoneEnabled: mocks.isMicrophoneEnabled,
    microphoneTrack: mocks.microphoneTrack,
  }),
  useLocalParticipantPermissions: () => mocks.permissions,
  useParticipants: () => mocks.participants,
  useTracks: () => mocks.cameraTracks,
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
      <CaptureProbe />
    </QueryClientProvider>
  );
  const result = render(ui(joined));
  return { ...result, setJoined: (next: boolean) => result.rerender(ui(next)) };
}

beforeEach(async () => {
  // Lets the last test's tab voice hold run its deferred release.
  await new Promise(resolve => setTimeout(resolve, 0));
  mocks.acquired = true;
  mocks.requestTakeover = false;
  mocks.refusedBy = undefined;
  mocks.roomProps = null;
  mocks.connectionState = ConnectionState.Connected;
  mocks.canPlayAudio = true;
  mocks.isMicrophoneEnabled = false;
  mocks.microphoneTrack = undefined;
  mocks.participants = [];
  mocks.permissions = undefined;
  mocks.published.clear();
  mocks.created = [];
  mocks.publishing.clear();
  mocks.cameraTracks = [];
  mocks.getDebateLobbyVoiceToken.mockResolvedValue(token());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.roomListeners.clear();
});

let latestCapture: LobbyCapture | null = null;
function CaptureProbe() {
  latestCapture = useLobbyCapture('audio');
  return null;
}
const captureOn = () => latestCapture?.on ?? null;

let latestVideoCapture: LobbyCapture | null = null;
function VideoCaptureProbe() {
  latestVideoCapture = useLobbyCapture('video');
  return null;
}

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

  it('registers its mic capture for a request card to release', async () => {
    const track = {};
    mocks.microphoneTrack = { track };
    const view = renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(lobbyCaptureLive('audio')).toBe(true);
    expect(captureOn()).toBe(false);

    act(() => releaseLobbyCapture('audio'));

    expect(mocks.unpublishTrack).toHaveBeenCalledWith(track, true);
    expect(mocks.roomProps).toMatchObject({ audio: false });
    view.unmount();
    expect(lobbyCaptureLive('audio')).toBe(false);
  });

  it('reports whether its captured mic is on', async () => {
    mocks.microphoneTrack = { track: {} };
    mocks.isMicrophoneEnabled = true;
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });

    expect(captureOn()).toBe(true);
  });

  it('keeps its mic capture registered through a reconnect', async () => {
    mocks.microphoneTrack = { track: {} };
    mocks.connectionState = ConnectionState.Reconnecting;
    renderVoice();
    await waitFor(() => expect(mocks.roomProps).not.toBeNull());

    expect(lobbyCaptureLive('audio')).toBe(true);
  });

  it('registers no capture without a mic track', async () => {
    mocks.connectionState = ConnectionState.Connecting;
    renderVoice();
    await waitFor(() => expect(mocks.roomProps).not.toBeNull());

    expect(lobbyCaptureLive('audio')).toBe(false);
  });

  it('gives a listener no mic', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false }));
    renderVoice(lobby('listener'));
    expect(await screen.findByText('You’re listening')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull();
    expect(mocks.roomProps).toMatchObject({ audio: false });
  });

  // GEO-3336. A step-out from the server unmounts the voice before the route into the debate runs.
  it('leaves its mic for the step-out to carry after it unmounts', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ start_muted: true }));
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    cleanup();
    carryLobbyJoinChoice();
    expect(readCarriedLobbyChoice()).toEqual({ micOn: false });

    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token());
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    cleanup();
    carryLobbyJoinChoice();
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true });
    clearCarriedLobbyChoice();
    forgetLobbyDevices();
  });

  it('gives a listener no mic to carry', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false }));
    renderVoice(lobby('listener'));
    expect(await screen.findByText('You’re listening')).toBeTruthy();
    carryLobbyJoinChoice();
    expect(readCarriedLobbyChoice()).toBeNull();
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

  it('says a live debate holds voice, with nothing to press', async () => {
    mocks.acquired = false;
    mocks.refusedBy = 'debate';
    renderVoice();
    expect(await screen.findByText('Voice is on in your debate tab')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use voice here' })).toBeNull();
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

/** A LiveKit-shaped JWT whose video grant lists `sources`, or allows everything without them. */
function grantToken(sources?: string[]) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const video = { roomJoin: true, canPublish: true, ...(sources ? { canPublishSources: sources } : {}) };
  return `${encode({ alg: 'HS256' })}.${encode({ video })}.sig`;
}

const CAMERA_TOKEN = grantToken(['microphone', 'camera']);

describe('LobbyVoice camera (GEO-3307)', () => {
  const cameraButton = () => screen.queryByRole('button', { name: /Turn camera (on|off)/ });

  it('offers a speaker the camera, off until they turn it on', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    const turnOn = await screen.findByRole('button', { name: 'Turn camera on' });
    expect(mocks.createTracks).not.toHaveBeenCalled();
    expect(mocks.roomProps).toMatchObject({ video: false });

    fireEvent.click(turnOn);
    await waitFor(() => expect(mocks.published.size).toBe(1));
    expect(mocks.createTracks).toHaveBeenCalledWith({ video: true });
    const [camera] = mocks.created;
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    expect(camera!.stop).toHaveBeenCalled();
    await waitFor(() => expect(mocks.published.size).toBe(0));
    expect(mocks.unpublishTrack).toHaveBeenCalledWith(camera, true);
  });

  it('leaves its camera for the step-out to carry', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    cleanup();
    carryLobbyJoinChoice();
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true, cameraOn: true });
    clearCarriedLobbyChoice();
    forgetLobbyDevices();
  });

  // Routing in releases the camera, which turns the choice off: the carry reads it from before.
  it('carries a camera that routing into a debate released', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    const [camera] = mocks.created;
    routeIntoDebate(() => undefined);
    expect(camera!.stop).toHaveBeenCalled();
    // The step-out carries after the lobby has re-rendered with the camera off.
    expect(await screen.findByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    carryLobbyJoinChoice();
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true, cameraOn: true });
    clearCarriedLobbyChoice();
    forgetLobbyDevices();
  });

  it('carries a camera turned off in the lobby as off', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    await waitFor(() => expect(mocks.published.size).toBe(0));
    routeIntoDebate(() => carryLobbyJoinChoice());
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true, cameraOn: false });
    clearCarriedLobbyChoice();
    forgetLobbyDevices();
  });

  // GEO-3161: the off switch mints a mic-only token.
  it('hides the camera, and never opens it, when lobby video is off', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: grantToken(['microphone']) }));
    renderVoice();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(cameraButton()).toBeNull();
    expect(mocks.createTracks).not.toHaveBeenCalled();
    expect(screen.queryByText(/Camera/)).toBeNull();
  });

  it('never offers a listener a camera, even on a token that would allow one', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false, token: CAMERA_TOKEN }));
    renderVoice(lobby('listener'));
    await screen.findByText('You’re listening');
    expect(cameraButton()).toBeNull();
  });

  it('turns the camera off and frees it when a host moves the viewer to listeners', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    const { setJoined } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    const [camera] = mocks.created;

    mocks.permissions = { canPublish: false };
    setJoined(true);
    await screen.findByText('You’re listening');
    expect(cameraButton()).toBeNull();
    expect(camera!.stop).toHaveBeenCalled();
    expect(mocks.unpublishTrack).toHaveBeenCalledWith(camera, true);
    await waitFor(() => expect(lobbyCaptureLive('video')).toBe(false));
  });

  it('lets a listener promoted to speaker turn the camera on without rejoining', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false, token: CAMERA_TOKEN }));
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

    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    rerender(ui(lobby('speaker')));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
  });

  it('says a blocked camera is the camera, leaving the mic alone', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    mocks.createTracks.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText('Camera blocked. Allow it in your browser, then try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeTruthy();
    expect(screen.queryByText('Your microphone isn’t available.')).toBeNull();
    expect(mocks.roomProps).toMatchObject({ audio: true });
    expect(lobbyCaptureLive('video')).toBe(false);
  });

  it('routes a camera failure LiveKit reports to the camera, not the mic', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    await screen.findByRole('button', { name: 'Turn camera on' });
    const onFailure = mocks.roomProps!.onMediaDeviceFailure as (failure: string, kind: string) => void;
    act(() => onFailure('PermissionDenied', 'videoinput'));

    expect(await screen.findByText('Camera blocked. Allow it in your browser, then try again.')).toBeTruthy();
    expect(screen.queryByText('Your microphone isn’t available.')).toBeNull();
  });

  // iPhone Safari holds one capture: the picker or ready room cannot open the camera otherwise.
  it('frees the camera when stepping out into a debate', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    const [camera] = mocks.created;

    const unregister = registerLobbyStepOut(async () => undefined);
    const go = vi.fn();
    act(() => routeIntoDebate(go));
    expect(camera!.stop).toHaveBeenCalled();
    expect(mocks.unpublishTrack).toHaveBeenCalledWith(camera, true);
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeTruthy();
    unregister();
  });

  // A server step-out unmounts the room before the route into the debate runs.
  it('stops the camera synchronously when the room unmounts', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    const { unmount } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    const [camera] = mocks.created;

    expect(lobbyCaptureLive('video')).toBe(true);
    unmount();
    expect(camera!.stop).toHaveBeenCalled();
    expect(lobbyCaptureLive('video')).toBe(false);
    // Nothing is registered any more, so a later route cannot reach it.
    camera!.stop.mockClear();
    routeIntoDebate(vi.fn());
    expect(camera!.stop).not.toHaveBeenCalled();
  });

  it('starts with the camera off after taking voice back from another tab', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    const [camera] = mocks.created;

    mocks.requestTakeover = true;
    act(() =>
      mocks.roomListeners.get('disconnected')?.forEach(listener => listener(DisconnectReason.DUPLICATE_IDENTITY))
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Use voice here' }));
    expect(await screen.findByRole('button', { name: 'Turn camera on' })).toBeTruthy();
    expect(camera!.stop).toHaveBeenCalled();
    expect(mocks.createTracks).toHaveBeenCalledTimes(1);
  });

  it('hands the roster each unmuted camera, by dashless id', async () => {
    mocks.cameraTracks = [
      { participant: { identity: 'AA-BB' }, publication: { track: {}, isMuted: false } },
      { participant: { identity: 'ccdd' }, publication: { track: {}, isMuted: true } },
      { participant: { identity: 'eeff' }, publication: { track: null, isMuted: false } },
    ];
    function Cameras() {
      const { cameras } = useLobbyVoiceStates();
      return <p data-testid="cameras">{[...cameras.keys()].join(',')}</p>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LobbyVoice lobby={lobby()} connectionId="conn-1" joined currentUserId="u1" onConnectedChange={vi.fn()}>
          <Cameras />
        </LobbyVoice>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('cameras').textContent).toBe('aabb'));
  });

  it('registers the camera as the lobby’s video capture while it holds one', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
    renderVoice();
    render(<VideoCaptureProbe />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(latestVideoCapture?.on).toBe(true));

    // Turning it off lets the device go, so nothing is left to register.
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    expect(lobbyCaptureLive('video')).toBe(false);
    await waitFor(() => expect(latestVideoCapture).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));
    expect(latestVideoCapture?.on).toBe(true);
    const camera = mocks.created[1];
    act(() => releaseLobbyCapture('video'));
    expect(camera!.stop).toHaveBeenCalled();
    expect(mocks.unpublishTrack).toHaveBeenCalledWith(camera, true);
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeTruthy();
    expect(lobbyCaptureLive('video')).toBe(false);
    await waitFor(() => expect(latestVideoCapture).toBeNull());
  });
});

// A camera being acquired or published has no publication yet; every release must still reach it.
describe('LobbyVoice camera still being acquired', () => {
  beforeEach(() => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ token: CAMERA_TOKEN }));
  });

  it('registers the capture as soon as the acquisition starts', async () => {
    holdCameraAcquisition();
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createTracks).toHaveBeenCalled());
    expect(lobbyCaptureLive('video')).toBe(true);
  });

  it('stops a camera that arrives after the room unmounted, and never publishes it', async () => {
    const acquisition = holdCameraAcquisition();
    const { unmount } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createTracks).toHaveBeenCalled());

    unmount();
    expect(lobbyCaptureLive('video')).toBe(false);
    await acquisition.resolve();
    expect(acquisition.track.stop).toHaveBeenCalled();
    expect(mocks.publishTrack).not.toHaveBeenCalled();
  });

  it('stops a camera at once when released while its publish is in flight', async () => {
    const publish = holdCameraPublish();
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalled());
    const [camera] = mocks.created;

    act(() => releaseLobbyCapture('video'));
    expect(camera!.stop).toHaveBeenCalled();
    expect(lobbyCaptureLive('video')).toBe(false);
    await publish.resolve();
    await waitFor(() => expect(mocks.published.size).toBe(0));
    expect(mocks.unpublishTrack).toHaveBeenCalledWith(camera, true);
  });

  it('ends a quick off and on with exactly one live camera', async () => {
    const first = holdCameraAcquisition();
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.published.size).toBe(1));

    await first.resolve();
    expect(first.track.stop).toHaveBeenCalled();
    expect(mocks.publishTrack).not.toHaveBeenCalledWith(first.track);
    const live = [...mocks.published];
    expect(live).toHaveLength(1);
    expect(live[0]!.stop).not.toHaveBeenCalled();
    expect(lobbyCaptureLive('video')).toBe(true);
  });

  it('stops a camera that arrives after a host moved the viewer to listeners', async () => {
    const acquisition = holdCameraAcquisition();
    const { setJoined } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createTracks).toHaveBeenCalled());

    mocks.permissions = { canPublish: false };
    setJoined(true);
    await screen.findByText('You’re listening');
    expect(lobbyCaptureLive('video')).toBe(false);
    await acquisition.resolve();
    expect(acquisition.track.stop).toHaveBeenCalled();
    expect(mocks.publishTrack).not.toHaveBeenCalled();
  });

  it('stops a camera that arrives after the room disconnected', async () => {
    const acquisition = holdCameraAcquisition();
    const { setJoined } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createTracks).toHaveBeenCalled());

    mocks.connectionState = ConnectionState.Disconnected;
    setJoined(true);
    await waitFor(() => expect(lobbyCaptureLive('video')).toBe(false));
    await acquisition.resolve();
    expect(acquisition.track.stop).toHaveBeenCalled();
    expect(mocks.publishTrack).not.toHaveBeenCalled();
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

  it('hands a visitor’s roster each speaker’s camera', async () => {
    mocks.cameraTracks = [{ participant: { identity: 'U-2' }, publication: { track: {}, isMuted: false } }];
    const onStates = vi.fn();
    render(
      <LobbyGuestVoice
        token={guestToken}
        onStates={onStates}
        onReconnect={vi.fn()}
        onAutoReconnect={() => false}
        onRemoved={vi.fn()}
      />
    );
    await waitFor(() => expect(onStates.mock.lastCall?.[0].cameras.has('u2')).toBe(true));
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

// GEO-3419: what a space call adds to the voice room. A lobby passes neither option.
describe('LobbyVoice in a space call', () => {
  const getDisplayMedia = vi.fn();
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia, enumerateDevices: async () => [] },
    });
  });

  function renderCall(options: Partial<React.ComponentProps<typeof LobbyVoice>> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <LobbyVoice
          lobby={lobby()}
          connectionId="conn-1"
          joined
          currentUserId="u1"
          onConnectedChange={vi.fn()}
          {...options}
        >
          <Speaking />
        </LobbyVoice>
      </QueryClientProvider>
    );
  }

  it('offers a lobby no screen share, whatever the token says', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_share_screen: true }));
    renderCall();
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(screen.queryByRole('button', { name: 'Share your screen' })).not.toBeInTheDocument();
  });

  it('lets a call’s speaker share their screen, with its audio', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_share_screen: true }));
    renderCall({ screenShare: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Share your screen' }));
    expect(mocks.setScreenShareEnabled).toHaveBeenCalledWith(true, { audio: true });
  });

  it('offers no screen share when the token does not allow it', async () => {
    renderCall({ screenShare: true });
    await screen.findByRole('button', { name: /Unmute|Mute/ });
    expect(screen.queryByRole('button', { name: 'Share your screen' })).not.toBeInTheDocument();
  });

  it('holds a publisher at the device check, then connects with what they chose', async () => {
    renderCall({
      preJoin: join => (
        <button type="button" onClick={() => join({ audioEnabled: false, videoEnabled: false })}>
          Join with these
        </button>
      ),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Join with these' }));
    expect(mocks.roomProps).toMatchObject({ audio: false });
    expect(screen.queryByRole('button', { name: 'Join with these' })).not.toBeInTheDocument();
  });

  it('connects a listener without the device check', async () => {
    mocks.getDebateLobbyVoiceToken.mockResolvedValue(token({ can_publish: false }));
    renderCall({ preJoin: () => <p>device check</p> });
    await waitFor(() => expect(mocks.roomProps).not.toBeNull());
    expect(screen.queryByText('device check')).not.toBeInTheDocument();
  });
});
