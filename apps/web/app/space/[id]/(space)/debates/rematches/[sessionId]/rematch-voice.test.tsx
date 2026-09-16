import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';

import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';

import { RematchVoicePill } from './rematch-voice';

const mocks = vi.hoisted(() => ({
  joinData: null as { token: string; url: string; room_name: string; participant_slot: 1 | 2 } | null,
  joinError: null as Error | null,
  joinLoading: false,
  /** Hand back a token even when the hook is disabled, to isolate the prime's other gates. */
  joinIgnoresEnabled: false,
  /** Every (sessionId, enabled) pair the token hook was consulted with, in render order. */
  joinCalls: [] as Array<{ sessionId: string; enabled: boolean }>,
  acquireResult: { acquired: true, waitedForLocalRelease: false },
  requestTakeover: vi.fn(() => Promise.resolve(false)),
  release: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
  coordinatorOptions: [] as Array<{
    debateId: string;
    userId: string;
    onTakeoverRequested?: () => Promise<boolean> | boolean;
  }>,
  connectionState: 'connected',
  canPlayAudio: true,
  startAudio: vi.fn(() => Promise.resolve()),
  audioDevices: [] as Array<{ deviceId: string; groupId: string; kind: string; label: string }>,
  speakerDevices: [] as Array<{ deviceId: string; groupId: string; kind: string; label: string }>,
  activeDeviceId: 'mic-a',
  activeSpeakerId: 'speaker-a',
  setActiveMediaDevice: vi.fn(() => Promise.resolve()),
  setActiveSpeaker: vi.fn(() => Promise.resolve()),
  changeAudioInput: vi.fn(),
  changeAudioOutput: vi.fn(() => Promise.resolve()),
  remoteParticipants: [] as Array<{ identity: string; getTrackPublication: (source: string) => unknown }>,
  /** What the opponent has published. `undefined` is a peer who joined muted and never opened up. */
  opponentMicPublication: { isMuted: false } as { isMuted: boolean } | undefined,
  // Returns a promise, like the real one: the unmute click attaches a `.catch` to it.
  setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
  isMicrophoneEnabled: true,
  isSpeaking: false,
  localIsSpeaking: false,
  /** Props of every `<LiveKitRoom>` mount, so tests can drive its callbacks. */
  livekitRoomProps: [] as Array<Record<string, unknown>>,
  /** One entry per `<LiveKitRoom>` *mount*, holding the token it connected with. */
  livekitRoomMounts: [] as string[],
  /** Every `useMediaDeviceSelect` call, to prove the picker never re-prompts for the microphone. */
  deviceSelectCalls: [] as Array<{ kind: string; requestPermissions?: boolean }>,
  disconnect: vi.fn(() => Promise.resolve()),
  /** The up-front permission prime, and the track it is obliged to hand straight back. */
  getUserMedia: vi.fn(),
  micTrackStop: vi.fn(),
  permissionsQuery: vi.fn(),
  micPermissionState: 'prompt' as PermissionState | 'unsupported',
  /** The microphone carried over from the debate. Empty means the user never picked one. */
  selectedAudioInputId: '',
  /** The published microphone, once there is one. */
  microphoneTrack: undefined as { track: Record<string, unknown> } | undefined,
  useKrispNoiseFilter: vi.fn(() => ({ setNoiseFilterEnabled: vi.fn(() => Promise.resolve()) })),
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: Record<string, unknown>) => {
    mocks.livekitRoomProps.push(props);
    // Mounts, not renders: recovery works by remounting the room around a fresh token, and only a
    // mount count can tell that apart from a re-render of the same connection.
    const token = props.token as string;
    React.useEffect(() => {
      mocks.livekitRoomMounts.push(token);
    }, [token]);
    return <div data-testid="livekit-room">{props.children as ReactElement}</div>;
  },
  RoomAudioRenderer: () => null,
  useAudioPlayback: () => ({ canPlayAudio: mocks.canPlayAudio, startAudio: mocks.startAudio }),
  useConnectionState: () => mocks.connectionState,
  // Faithful to the real hook on the two things that matter here: it reads the publication for
  // the source it is handed, treats a participant with nothing published as muted, and blows up
  // without a participant (`useEnsureParticipant` throws outside a context, and this dock
  // provides none). A flat constant here hid both a wrong-source and a missing-participant bug.
  useIsMuted: (ref: { participant?: { getTrackPublication: (source: string) => unknown }; source?: string }) => {
    if (!ref?.participant) throw new Error('useIsMuted was given no participant');
    const publication = ref.participant.getTrackPublication(ref.source ?? '') as { isMuted: boolean } | undefined;
    return publication?.isMuted ?? true;
  },
  useIsSpeaking: (participant?: { identity?: string }) => {
    if (!participant) throw new Error('useIsSpeaking was given no participant');
    return participant.identity === 'me' ? mocks.localIsSpeaking : mocks.isSpeaking;
  },
  useLocalParticipant: () => ({
    localParticipant: { identity: 'me', setMicrophoneEnabled: mocks.setMicrophoneEnabled },
    isMicrophoneEnabled: mocks.isMicrophoneEnabled,
    microphoneTrack: mocks.microphoneTrack,
  }),
  useRemoteParticipants: () => mocks.remoteParticipants,
  useRoomContext: () => ({ disconnect: mocks.disconnect }),
  useMediaDeviceSelect: ({ kind, requestPermissions }: { kind: MediaDeviceKind; requestPermissions?: boolean }) => {
    mocks.deviceSelectCalls.push({ kind, requestPermissions });
    return kind === 'audiooutput'
      ? {
          devices: mocks.speakerDevices,
          activeDeviceId: mocks.activeSpeakerId,
          setActiveMediaDevice: mocks.setActiveSpeaker,
        }
      : {
          devices: mocks.audioDevices,
          activeDeviceId: mocks.activeDeviceId,
          setActiveMediaDevice: mocks.setActiveMediaDevice,
        };
  },
}));

vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: mocks.useKrispNoiseFilter,
}));

vi.mock('livekit-client', () => ({
  ConnectionState: {
    Connected: 'connected',
    Connecting: 'connecting',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    SignalReconnecting: 'signalReconnecting',
  },
  MediaDeviceFailure: {
    PermissionDenied: 'PermissionDenied',
    NotFound: 'NotFound',
    DeviceInUse: 'DeviceInUse',
    Other: 'Other',
  },
  Track: { Source: { Microphone: 'microphone' } },
}));

vi.mock('~/core/debates/hooks', () => ({
  debateQueryKeys: {
    rematchLiveKit: (accountKey: string | null, sessionId: string) => ['rematch-livekit', accountKey, sessionId],
  },
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'account-1',
    getPrivyIdentityToken: vi.fn(),
  }),
  useRematchLiveKitJoin: (sessionId: string, enabled: boolean) => {
    mocks.joinCalls.push({ sessionId, enabled });
    // The real hook is itself gated on `voiceActive && ownership === 'owned'`, so withholding a
    // token whenever those are false makes the prime's other gate clauses untestable — the token
    // check alone would close the gate. `joinIgnoresEnabled` hands a token over anyway, so a test
    // can prove a specific clause is load-bearing.
    if (!enabled && !mocks.joinIgnoresEnabled) return { data: undefined, error: null, isLoading: false };
    return { data: mocks.joinData, error: mocks.joinError, isLoading: mocks.joinLoading };
  },
}));

vi.mock('~/core/debates/media-session', () => ({
  systemDefaultAudioOutput: { deviceId: 'default', groupId: 'default', kind: 'audiooutput', label: 'System default' },
  useDebateMediaSession: () => ({
    selectedAudioInputId: mocks.selectedAudioInputId,
    audioOutputError: null,
    changeAudioInput: mocks.changeAudioInput,
    changeAudioOutput: mocks.changeAudioOutput,
  }),
}));

vi.mock('~/core/debates/debate-room-ownership', () => ({
  createDebateRoomOwnershipCoordinator: (options: {
    debateId: string;
    userId: string;
    onTakeoverRequested?: () => Promise<boolean> | boolean;
  }) => {
    mocks.coordinatorOptions.push(options);
    return {
      instanceId: 'test-instance',
      coordinationMode: 'lock-and-broadcast',
      acquire: () => Promise.resolve(mocks.acquireResult),
      requestTakeover: mocks.requestTakeover,
      release: mocks.release,
      close: mocks.close,
      ownsConnection: () => mocks.acquireResult.acquired,
    };
  },
}));

vi.mock('~/design-system/avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

function makeSession(status: DebateRematchSession['status']): DebateRematchSession {
  return {
    id: 'session-1',
    source_debate_id: null,
    source_space_id: 'space-1',
    status,
    participants: [
      {
        user_id: 'me',
        profile_space_id: 'me-space',
        display_name: 'Me',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: null,
      },
      {
        user_id: 'them',
        profile_space_id: 'them-space',
        display_name: 'Salina',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: null,
      },
    ],
    decision_expires_at: '2026-08-27T00:00:00Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-08-27T00:00:00Z',
    updated_at: '2026-08-27T00:00:00Z',
  };
}

const TOKEN_QUERY_KEY = ['rematch-livekit', 'account-1', 'session-1'];

function render(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...rtlRender(element, { wrapper }), client };
}

async function flushOwnership() {
  // The ownership effect resolves acquire() in a microtask before anything voice renders.
  await act(async () => {
    await Promise.resolve();
  });
}

/** The avatar box next to a name in the dock — the element that carries the speaking ring. */
function avatarFor(name: string) {
  return screen.getByText(name).previousElementSibling;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function setMobileLayout(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

/**
 * The opponent as LiveKit hands them over. `getTrackPublication` is what the `useIsMuted` mock
 * reads, matching the real hook: no publication at all is a peer who joined muted and never
 * opened up, which reports as muted rather than as unmuted.
 */
function remoteOpponent() {
  // Honours the source it is asked for, like the real participant: asking for the wrong track
  // must come back empty rather than quietly handing over the microphone.
  return {
    identity: 'them',
    getTrackPublication: (source: string) => (source === 'microphone' ? mocks.opponentMicPublication : undefined),
  };
}

/** jsdom ships neither `mediaDevices` nor a microphone permission descriptor. */
function stubMicrophoneApis() {
  mocks.micPermissionState = 'prompt';
  mocks.selectedAudioInputId = '';
  mocks.micTrackStop.mockReset();
  mocks.getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: mocks.micTrackStop }] });
  mocks.permissionsQuery.mockReset().mockImplementation(async () => {
    // Firefox has no 'microphone' descriptor and rejects the query outright.
    if (mocks.micPermissionState === 'unsupported') throw new Error('unsupported descriptor');
    return { state: mocks.micPermissionState };
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mocks.getUserMedia },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: mocks.permissionsQuery },
  });
}

beforeEach(() => {
  stubMicrophoneApis();
  // The settings popover measures its trigger to place itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  setMobileLayout(false);
  mocks.joinData = {
    token: 'token-1',
    url: 'wss://livekit.test',
    room_name: 'geo-rematch-session-1',
    participant_slot: 1,
  };
  mocks.joinError = null;
  mocks.joinLoading = false;
  mocks.joinIgnoresEnabled = false;
  mocks.joinCalls = [];
  mocks.acquireResult = { acquired: true, waitedForLocalRelease: false };
  mocks.requestTakeover.mockReset().mockResolvedValue(false);
  mocks.release.mockReset().mockResolvedValue(undefined);
  mocks.close.mockReset();
  mocks.coordinatorOptions = [];
  mocks.connectionState = 'connected';
  mocks.canPlayAudio = true;
  mocks.startAudio.mockReset().mockResolvedValue(undefined);
  mocks.audioDevices = [
    { deviceId: 'mic-a', groupId: 'g1', kind: 'audioinput', label: 'Built-in Microphone' },
    { deviceId: 'mic-b', groupId: 'g2', kind: 'audioinput', label: 'USB Microphone' },
  ];
  mocks.speakerDevices = [
    { deviceId: 'speaker-a', groupId: 'g1', kind: 'audiooutput', label: 'Built-in Speakers' },
    { deviceId: 'speaker-b', groupId: 'g2', kind: 'audiooutput', label: 'AirPods' },
  ];
  mocks.activeDeviceId = 'mic-a';
  mocks.activeSpeakerId = 'speaker-a';
  mocks.setActiveMediaDevice.mockReset().mockResolvedValue(undefined);
  mocks.setActiveSpeaker.mockReset().mockResolvedValue(undefined);
  mocks.changeAudioInput.mockReset();
  mocks.changeAudioOutput.mockReset().mockResolvedValue(undefined);
  mocks.deviceSelectCalls = [];
  mocks.remoteParticipants = [];
  mocks.opponentMicPublication = { isMuted: false };
  mocks.setMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
  mocks.isMicrophoneEnabled = true;
  mocks.isSpeaking = false;
  mocks.localIsSpeaking = false;
  mocks.livekitRoomProps = [];
  mocks.livekitRoomMounts = [];
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.microphoneTrack = undefined;
  mocks.useKrispNoiseFilter.mockClear();
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
});

describe('RematchVoicePill', () => {
  it('renders nothing once the session leaves a voice-capable status', async () => {
    for (const status of ['deciding', 'converted', 'ended', 'expired'] as const) {
      const { container, unmount } = render(<RematchVoicePill session={makeSession(status)} currentUserId="me" />);
      await flushOwnership();
      expect(container.querySelector('[data-testid="livekit-room"]')).toBeNull();
      expect(container.textContent).toBe('');
      unmount();
    }
    // The token endpoint is never even consulted for these.
    expect(mocks.joinCalls.every(call => !call.enabled)).toBe(true);
  });

  it('renders nothing when the backend has no voice support', async () => {
    for (const error of [
      new GeoChatRequestError('not found', null, 404),
      new GeoChatRequestError('LiveKit is not configured', 'livekit_not_configured', 503),
    ]) {
      mocks.joinError = error;
      mocks.joinData = null;
      const { container, unmount } = render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
      await flushOwnership();
      expect(container.querySelector('[data-testid="livekit-room"]')).toBeNull();
      expect(container.textContent).toBe('');
      unmount();
    }
  });

  it('offers a retry when the token fetch fails for an unexpected reason', async () => {
    mocks.joinError = new GeoChatRequestError('boom', null, 500);
    mocks.joinData = null;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByText('Voice is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('connects the room and waits for the opponent when they have not joined yet', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    // The design keeps both names on screen throughout; only the opponent's chip changes.
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Salina')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Waiting for Salina to join' })).toBeInTheDocument();
    // Auto-join, but muted: the room connects to listen, not to publish.
    expect(mocks.livekitRoomProps[0]?.audio).toBe(false);
    // The ownership lock is namespaced away from real debate ids.
    expect(mocks.coordinatorOptions[0]?.debateId).toBe('rematch:session-1');
  });

  // "Other person is muted → red muted variant; not muted → green unmuted variant" (GEO-2511).
  it('shows the opponent as unmuted once their participant appears', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const chip = screen.getByRole('img', { name: 'Salina is unmuted' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-successTertiary');
    expect(screen.queryByRole('img', { name: /Waiting for/ })).toBeNull();
  });

  it('shows the opponent as muted when they mute themselves', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    // A speaker update that arrives just before the mute leaves `isSpeaking` set until the next
    // one; the row must not contradict itself in that window.
    mocks.isSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const chip = screen.getByRole('img', { name: 'Salina is muted' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-errorTertiary');
    expect(avatarFor('Salina')).not.toHaveClass('ring-green');
  });

  it('rings the speaking participant, whichever side is talking', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.localIsSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('You')).toHaveClass('ring-green');
    expect(avatarFor('Salina')).not.toHaveClass('ring-green');

    cleanup();
    mocks.localIsSpeaking = false;
    mocks.isSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('Salina')).toHaveClass('ring-green');
    expect(avatarFor('You')).not.toHaveClass('ring-green');
  });

  // Muting does not retract the active-speaker update that preceded it, so a stale one would
  // otherwise leave the ring lit on a microphone nobody can hear.
  it('drops the local ring the moment the microphone is off', async () => {
    mocks.localIsSpeaking = true;
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('You')).not.toHaveClass('ring-green');
  });

  it('mutes and unmutes the local microphone', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);

    cleanup();
    mocks.isMicrophoneEnabled = false;
    mocks.setMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('stays connected listen-only when the microphone fails', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    // The room stays mounted — opponent audio keeps playing — but publishing is off the table.
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    const muteButton = screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ });
    expect(muteButton).toBeDisabled();

    // A disabled button is out of the tab order and its tooltip is unreachable, so the reason and
    // the way out have to be in the dock itself.
    expect(screen.getByText(/Microphone blocked/).closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('explains which microphone problem it hit', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;

    act(() => onMediaDeviceFailure('NotFound'));
    expect(screen.getByText(/No microphone found/)).toBeInTheDocument();

    act(() => onMediaDeviceFailure('DeviceInUse'));
    expect(screen.getByText(/in use by another app/)).toBeInTheDocument();
  });

  it('recovers from a denied microphone without a page reload', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
    expect(mocks.livekitRoomMounts).toHaveLength(2);
  });

  // `room.connect()` rejecting is a console warning and nothing else — the connect effect never
  // re-runs — so without this the dock claims it is connecting for as long as the page is open.
  it('offers a retry when the room never manages to connect', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const onError = mocks.livekitRoomProps[0]?.onError as (error: Error) => void;

    act(() => onError(new Error('could not establish signal connection')));

    expect(screen.queryByTestId('livekit-room')).toBeNull();
    expect(screen.getByText('Voice is unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('livekit-room')).toBeInTheDocument());
    expect(mocks.livekitRoomMounts).toHaveLength(2);
  });

  // `onError` also fires when publishing the local track fails, which happens *after* the room is
  // up. Tearing the call down over a microphone problem would take the opponent's audio with it.
  it('keeps a connected room when publishing the microphone fails', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const props = mocks.livekitRoomProps[0] as Record<string, (arg?: unknown) => void>;

    act(() => props.onConnected());
    act(() => props.onError(new Error('could not acquire microphone')));

    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    expect(screen.queryByText('Voice is unavailable')).toBeNull();
  });

  // Enumerating devices with `requestPermissions` prompts again whenever a label is blank, which is
  // exactly the state a denied microphone leaves them in — and the rejection empties the list.
  it('never asks for the microphone a second time to fill the device picker', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));

    expect(mocks.deviceSelectCalls.length).toBeGreaterThan(0);
    expect(mocks.deviceSelectCalls.every(call => call.requestPermissions === false)).toBe(true);
  });

  // Auto-join gives the browser no user gesture to hang playback on, so a blocked room looks
  // perfectly healthy — presence and mute state keep updating — while the viewer hears silence.
  it('asks for a click when the browser blocks audio playback', async () => {
    mocks.canPlayAudio = false;
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const enable = screen.getByRole('button', { name: /enable audio/i });
    fireEvent.click(enable);
    expect(mocks.startAudio).toHaveBeenCalled();
  });

  it('does not ask for a click while audio plays normally', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByRole('button', { name: /enable audio/i })).toBeNull();
  });

  // The picked devices have to switch the live call AND survive into the debate that follows, which
  // is the whole reason each choice is written back to the shared media session.
  it('switches the live microphone and carries the choice into the debate', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.click(await screen.findByText('USB Microphone'));

    expect(mocks.setActiveMediaDevice).toHaveBeenCalledWith('mic-b');
    expect(mocks.changeAudioInput).toHaveBeenCalledWith('mic-b');
  });

  it('switches the live speaker and carries the choice into the debate', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.click(await screen.findByText('AirPods'));

    expect(mocks.setActiveSpeaker).toHaveBeenCalledWith('speaker-b');
    expect(mocks.changeAudioOutput).toHaveBeenCalledWith('speaker-b');
  });

  // Firefox and Safari enumerate no outputs at all, and an empty list reads as a broken picker.
  it('falls back to the system default speaker when the browser cannot route audio', async () => {
    mocks.speakerDevices = [];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    expect(await screen.findByText('System default')).toBeInTheDocument();
  });

  it('opens the audio settings in a bottom sheet on mobile', async () => {
    setMobileLayout(true);
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    const sheet = await screen.findByRole('dialog', { name: 'Audio settings' });
    expect(sheet).toHaveAttribute('data-layout', 'bottom-sheet');
    expect(screen.getByRole('button', { name: 'Close Audio settings' })).toBeInTheDocument();
  });

  // Rematch tokens live five minutes. An invalidated query keeps serving its old data while the
  // refetch is in flight, and the epoch bump is synchronous — so the room would remount around the
  // token that just failed. Resetting leaves nothing to remount around.
  it('drops the cached token when retrying rather than reconnecting around it', async () => {
    mocks.joinError = new GeoChatRequestError('boom', null, 500);
    mocks.joinData = null;
    const { client, rerender } = render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const reset = vi.spyOn(client, 'resetQueries');
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(reset).toHaveBeenCalledWith({ queryKey: TOKEN_QUERY_KEY });
    expect(invalidate).not.toHaveBeenCalled();

    // Clearing the token is only half of it — the room has to remount around the replacement.
    mocks.joinError = null;
    mocks.joinData = {
      token: 'token-2',
      url: 'wss://livekit.test',
      room_name: 'geo-rematch-session-1',
      participant_slot: 1,
    };
    rerender(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    expect(mocks.livekitRoomMounts).toEqual(['token-2']);
  });

  // A tab that yielded the mic is still holding the token it minted before it yielded, and five
  // minutes is a very reachable gap between handing the connection over and asking for it back.
  it('re-mints the token when taking the voice connection back from another tab', async () => {
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    const { client } = render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await waitFor(() => expect(screen.getByText('Voice is active in another tab')).toBeInTheDocument());

    const reset = vi.spyOn(client, 'resetQueries');
    mocks.requestTakeover.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use voice here' }));

    await waitFor(() => expect(reset).toHaveBeenCalledWith({ queryKey: TOKEN_QUERY_KEY }));
  });

  // Two tabs publishing at once is the failure this whole coordinator exists to prevent: the
  // yielding tab has to be off the air *before* it tells the other one to go ahead.
  it('disconnects before handing the voice connection to another tab', async () => {
    setVisibility('hidden');
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();

    const onTakeoverRequested = mocks.coordinatorOptions[0]?.onTakeoverRequested;
    let yielded: boolean | undefined;
    await act(async () => {
      yielded = await onTakeoverRequested?.();
    });

    expect(yielded).toBe(true);
    expect(mocks.disconnect).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('livekit-room')).toBeNull());
    expect(screen.getByText('Voice is active in another tab')).toBeInTheDocument();
  });

  // The tab the user is actually looking at keeps the microphone; only a background one steps aside.
  it('refuses to yield the microphone while the user is looking at this tab', async () => {
    setVisibility('visible');
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const onTakeoverRequested = mocks.coordinatorOptions[0]?.onTakeoverRequested;
    let yielded: boolean | undefined;
    await act(async () => {
      yielded = await onTakeoverRequested?.();
    });

    expect(yielded).toBe(false);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
  });

  // The dock connects the moment the pair lands here, with no click in between, so an unmuted join
  // opens a microphone nobody asked to open. This pins LiveKit's own capture only — the prime
  // still reaches `getUserMedia` once on the same visit, which the tests below cover.
  it('joins with the microphone muted', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);
  });

  // Joining muted means nothing would reach `getUserMedia` until the unmute click, which puts a
  // permission dialog in front of someone who has just started talking.
  it('asks for the microphone up front and hands it straight back', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({ audio: true }));
    // The microphone descriptor, not some other one: gating the mic prime on camera permission
    // would both skip priming when it should and prime on every mount when it should not.
    expect(mocks.permissionsQuery).toHaveBeenCalledWith({ name: 'microphone' });
    // Held open, the primed stream would keep the device seized and the browser's recording
    // indicator lit beside a dock that says muted.
    await waitFor(() => expect(mocks.micTrackStop).toHaveBeenCalled());
    // And priming publishes nothing: the room is still muted.
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);
  });

  // The prime has to open the same device `audioCaptureDefaults` will publish. A bare
  // `{audio: true}` opens the OS default instead, which can be busy in another call while the
  // chosen microphone is free, and names the wrong device in the prompt.
  it('primes the microphone the pair carried over from the debate', async () => {
    mocks.selectedAudioInputId = 'chosen-mic';
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: 'chosen-mic' } }));
    expect(mocks.livekitRoomProps.at(-1)?.options).toMatchObject({
      audioCaptureDefaults: { deviceId: 'chosen-mic' },
    });
  });

  // The prime only exists to move the prompt off the unmute click. The permission query it waits
  // on can still be pending when the user clicks unmute — a permission dialog stays 'prompt' for
  // as long as it is on screen — and by then `<LiveKitRoom audio>` is opening the device for real.
  // The prime has to drop out rather than fire a second request beside it.
  it('abandons a prime still in flight when the user unmutes', async () => {
    mocks.isMicrophoneEnabled = false;
    let answerPermission = () => {};
    mocks.permissionsQuery.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerPermission = () => resolve({ state: 'prompt' });
        })
    );

    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.permissionsQuery).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);

    // The browser answers only now, after the user has already asked for the microphone.
    await act(async () => {
      answerPermission();
    });

    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // Dismissing a permission dialog — closing it rather than answering — leaves the permission on
  // 'prompt', so the settled-state guard lets a second ask straight through. Nothing but a
  // per-visit latch stops the dock re-prompting someone who has already waved the dialog away.
  it('primes once a visit, however often the dock cycles back to wanting one', async () => {
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledTimes(1));

    // Unmute, then mute again. Both flips run through the `!micIntent` gate, so the prime's
    // `enabled` goes false and back to true — the same shape a takeover handed back or a token
    // retry produces.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });
    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    });

    expect(mocks.micPermissionState).toBe('prompt');
    expect(mocks.getUserMedia).toHaveBeenCalledTimes(1);
  });

  // The pair usually arrives straight from a debate, where the origin was already granted the
  // microphone. Priming again would open the device for nothing.
  it('skips the prime when the permission is already settled', async () => {
    for (const state of ['granted', 'denied'] as const) {
      // Reset inside the loop: otherwise the second pass's barrier is already satisfied by the
      // first pass's call, and the negative assertion below races an effect that has not run.
      mocks.permissionsQuery.mockClear();
      mocks.getUserMedia.mockClear();
      mocks.micPermissionState = state;
      const { unmount } = render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
      await flushOwnership();
      await waitFor(() => expect(mocks.permissionsQuery).toHaveBeenCalledTimes(1));
      expect(mocks.getUserMedia).not.toHaveBeenCalled();
      unmount();
    }
  });

  // Firefox has no 'microphone' descriptor, so the prime cannot tell a pending prompt from a
  // standing grant. Priming blind there would open the device on every single mount — the exact
  // seizure joining muted removes — so it stays shut and the prompt waits for the unmute click.
  it('never primes blind on a browser that cannot report the permission', async () => {
    mocks.micPermissionState = 'unsupported';
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.permissionsQuery).toHaveBeenCalled());

    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    // The dock still works; it is only the prompt's timing that differs.
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
  });

  // The opponent's chip and their speaking ring both hang off `useIsMuted`, so anything that
  // pins that value pins both. These two guard the round trip.
  it('shows a muted opponent as muted, with no speaking ring', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    mocks.isSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByRole('img', { name: 'Salina is muted' })).toBeInTheDocument();
    expect(avatarFor('Salina')).not.toHaveClass('ring-green');
  });

  it('lights the opponent ring the moment they unmute and speak', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: false };
    mocks.isSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByRole('img', { name: 'Salina is unmuted' })).toBeInTheDocument();
    expect(avatarFor('Salina')).toHaveClass('ring-green');
  });

  // A denied prime is the unmute button's problem, not the dock's: nothing should change on
  // screen until the user actually asks to speak.
  it('says nothing when the up-front prompt is denied', async () => {
    mocks.getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalled());

    expect(screen.queryByText(/Microphone blocked/)).toBeNull();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
  });

  // Muted is the default nobody chose, so the first time the other person actually says something
  // is when it most needs pointing out — and when silence starts reading as being ignored.
  it('says "You\'re muted" the first time the opponent speaks', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('muted-nudge')).toBeNull();

    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();
  });

  // The click that answers the nudge lands in the one window where `isMicrophoneEnabled` is still
  // false — the permission dialog holds it there until the user answers. Waiting on `muted` to
  // clear would leave "You're muted" sitting over the button they just pressed for as long as the
  // dialog is open, so the click has to take the bubble down itself.
  it('takes the nudge down on the unmute click, before the microphone opens', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });

    // Still muted as far as LiveKit is concerned — the dialog has not been answered.
    expect(mocks.isMicrophoneEnabled).toBe(false);
    expect(screen.queryByTestId('muted-nudge')).toBeNull();
    expect(screen.getByTestId('muted-nudge-announcement')).toHaveTextContent('');
  });

  it('leaves an unmuted user alone when the opponent speaks', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.isSpeaking = true;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('muted-nudge')).toBeNull();
  });

  // A nudge that returns on every turn is just a mute button that shouts.
  it('shows the muted nudge once and then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.isMicrophoneEnabled = false;
      mocks.remoteParticipants = [remoteOpponent()];
      const session = makeSession('browsing');
      const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
      await flushOwnership();

      mocks.isSpeaking = true;
      rerender(<RematchVoicePill session={session} currentUserId="me" />);
      expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

      // Long enough to actually read: still up most of the way to the deadline. Without this the
      // duration is bounded from above only, and a one-frame bubble would pass.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

      // It clears itself...
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByTestId('muted-nudge')).toBeNull();

      // ...and stays gone when they take another turn.
      mocks.isSpeaking = false;
      rerender(<RematchVoicePill session={session} currentUserId="me" />);
      mocks.isSpeaking = true;
      rerender(<RematchVoicePill session={session} currentUserId="me" />);
      expect(screen.queryByTestId('muted-nudge')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The real sequence, and the one the test above misses by holding the opponent talking for the
  // whole timeout: people stop speaking. If the dismissal clock shares an effect with the value
  // that tracks their voice, the pause tears the timer down and nothing re-arms it, leaving the
  // bubble parked over the mute button for the rest of the session.
  it('dismisses the muted nudge even after the opponent stops talking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.isMicrophoneEnabled = false;
      mocks.remoteParticipants = [remoteOpponent()];
      const session = makeSession('browsing');
      const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
      await flushOwnership();

      mocks.isSpeaking = true;
      rerender(<RematchVoicePill session={session} currentUserId="me" />);
      expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

      // They pause a second in, long before the nudge is due to go.
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      mocks.isSpeaking = false;
      rerender(<RematchVoicePill session={session} currentUserId="me" />);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByTestId('muted-nudge')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Once per visit, not once per connection. The dock tears its rows down on every reconnect and
  // every "audio is blocked" detour, so a one-shot held inside them would fire again and again
  // across a single sitting.
  it('does not repeat the muted nudge after a reconnect', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

    // Drop and come back, with the opponent talking again on the other side.
    mocks.isSpeaking = false;
    mocks.connectionState = 'reconnecting';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    mocks.connectionState = 'connected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    expect(screen.queryByTestId('muted-nudge')).toBeNull();
  });

  // A reconnect swaps the rows out for a message without the opponent ever leaving, so a last
  // "they are talking" that survives the blip fires the nudge at a silent room.
  it('does not fire the nudge at a silent opponent after a reconnect', async () => {
    // Unmuted while they talk: `opponentAudible` goes true with the nudge still unspent, which is
    // the only state in which a stale value can do any damage.
    mocks.isMicrophoneEnabled = true;
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.isSpeaking = true;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('muted-nudge')).toBeNull();

    // The blip takes the rows down mid-sentence.
    mocks.connectionState = 'reconnecting';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();

    // Back up, muted, with nobody talking. On remount the local row's effect runs before the
    // opponent row reports afresh, so a value left over from before the blip fires the nudge at
    // a silent room.
    mocks.isSpeaking = false;
    mocks.isMicrophoneEnabled = false;
    mocks.connectionState = 'connected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.queryByTestId('muted-nudge')).toBeNull();
  });

  // The whole gate, from the other side: every path that renders no dock must also ask for
  // nothing. Without these the gate can widen or narrow without a single test noticing.
  it('never primes the microphone on a session with no voice', async () => {
    // With a token on the table regardless, the voice-capable clause is the only thing that can
    // hold the prime back — otherwise the token check alone closes the gate and this proves
    // nothing about the clause it is named for.
    mocks.joinIgnoresEnabled = true;
    for (const status of ['deciding', 'converted', 'ended', 'expired'] as const) {
      const { unmount } = render(<RematchVoicePill session={makeSession(status)} currentUserId="me" />);
      await flushOwnership();
      unmount();
    }
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    expect(mocks.permissionsQuery).not.toHaveBeenCalled();
  });

  // A session that somehow arrives without an opponent draws no dock at all, so it must not put
  // a permission dialog on screen either.
  it('never primes the microphone without an opponent to talk to', async () => {
    mocks.joinIgnoresEnabled = true;
    const session = makeSession('browsing');
    const solo = { ...session, participants: [session.participants[0]] };
    const { container } = render(<RematchVoicePill session={solo} currentUserId="me" />);
    await flushOwnership();

    expect(container.textContent).toBe('');
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // The tab that does not hold the microphone lock must not open the microphone.
  it('never primes the microphone from a tab that yielded the connection', async () => {
    mocks.joinIgnoresEnabled = true;
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByText('Voice is active in another tab')).toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // A prompt on a page with no voice UI to explain it is worse than the one the prime moves.
  it('does not prime the microphone when there is no dock to join', async () => {
    mocks.joinData = null;
    mocks.joinError = new GeoChatRequestError('not found', null, 404);
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('livekit-room')).toBeNull();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // The prime resolves after the user has already navigated away, and a stream nobody stops holds
  // the microphone open for as long as the tab lives.
  it('releases a primed stream that arrives after the dock is gone', async () => {
    let releaseStream: ((stream: unknown) => void) | undefined;
    mocks.getUserMedia.mockReturnValue(
      new Promise(resolve => {
        releaseStream = resolve;
      })
    );

    const { unmount } = render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalled());

    unmount();
    await act(async () => {
      releaseStream?.({ getTracks: () => [{ stop: mocks.micTrackStop }] });
      await Promise.resolve();
    });

    expect(mocks.micTrackStop).toHaveBeenCalled();
  });

  // Unmuting is the first thing to open the microphone, so a denial rejects right here. LiveKit
  // reports it through `onMediaDeviceFailure`; the click must not also take the dock down with an
  // unhandled rejection.
  it('survives a rejected unmute', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.setMicrophoneEnabled.mockRejectedValue(new Error('NotAllowedError'));
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeInTheDocument();
  });

  // A dead microphone already has its own note under the dock, which says more than the bubble
  // could — and "You're muted" is bad advice when clicking unmute cannot help.
  it('suppresses the nudge when the microphone is broken rather than muted', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.queryByTestId('muted-nudge')).toBeNull();
    expect(screen.getByText(/Microphone blocked/)).toBeInTheDocument();
  });

  // An opponent who walks out mid-sentence leaves their last "talking" behind, and it would fire
  // the nudge at an empty room when they come back.
  it('forgets the opponent is talking once they leave', async () => {
    // Unmuted while they talk, so the nudge is unspent and there is a live "they are audible"
    // for their departure to strand.
    mocks.isMicrophoneEnabled = true;
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.isSpeaking = true;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('muted-nudge')).toBeNull();

    // They walk out mid-sentence.
    mocks.remoteParticipants = [];
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByRole('img', { name: 'Waiting for Salina to join' })).toBeInTheDocument();

    // The user then mutes. Nobody is here, let alone talking, so nothing should be nudged.
    mocks.isMicrophoneEnabled = false;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    expect(screen.queryByTestId('muted-nudge')).toBeNull();
  });

  // A live region inserted with its text already in it is unreliably announced, so the region has
  // to be mounted and empty first and only then change. That ordering is the fix, and it is what
  // this pins.
  it('announces the muted nudge from a region that was already mounted', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    // Present before there is anything to say.
    expect(screen.getByTestId('muted-nudge-announcement')).toHaveTextContent('');
    expect(screen.queryByTestId('muted-nudge')).toBeNull();

    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    const region = screen.getByTestId('muted-nudge-announcement');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent(/You.re muted/);
    // The visible bubble must not be read as well.
    expect(screen.getByTestId('muted-nudge')).toHaveAttribute('aria-hidden');
  });

  // Red fill is a mute the user chose and can undo by clicking; a dead microphone is neither, and
  // collapsing the two would send people clicking at a button that cannot help them.
  it('distinguishes a broken microphone from a chosen mute', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toHaveClass('bg-errorTertiary');

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    const failed = screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ });
    expect(failed).not.toHaveClass('bg-errorTertiary');
    expect(failed).toHaveClass('opacity-60');
  });

  // The nudge exists to get the mute button pressed, so it must never be what eats the click.
  it('keeps the muted nudge out of the way of the button it points at', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    expect(screen.getByTestId('muted-nudge')).toHaveClass('pointer-events-none');
  });

  // Unmuting is what the nudge was asking for; leaving it up afterwards is noise.
  it('drops the muted nudge as soon as the user unmutes', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    mocks.isSpeaking = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByTestId('muted-nudge')).toBeInTheDocument();

    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.queryByTestId('muted-nudge')).toBeNull();
  });

  // Muted is now the state users arrive in without choosing it, so it has to read as muted at a
  // glance rather than as a slash on an otherwise unchanged icon.
  it('marks the muted microphone in the same red as the opponent chip', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toHaveClass('bg-errorTertiary', 'text-red-01');
  });

  // `audio` is not a join-time flag: LiveKit replays `setMicrophoneEnabled(!!audio)` on every
  // reconnect, so an intent recorded only on the local track is undone by a network blip — and
  // with the dock joining muted, that blip re-mutes someone who deliberately chose to speak. The
  // mock room cannot replay that, so what is asserted here is the input it would replay.
  it('records mic intent on the room, not just on the local track', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  // Nothing else clears the failure, so without this a denied microphone means listen-only with a
  // dead mute button until the page is reloaded.
  it('clears the microphone failure when the user retries', async () => {
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    // A muted join never opens the microphone, so the failure this recovers from belongs to
    // someone who asked for it.
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeDisabled();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);

    // Retry is only reachable once the room has connected and then dropped.
    mocks.connectionState = 'disconnected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    mocks.connectionState = 'connected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
    // Retry drops the failure latch but keeps the choice to speak.
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  // Krisp substitutes its own output for the published microphone, so a filter that fails quietly
  // leaves this dock connected, unmuted and silent, with nothing on screen to say so. The lobby
  // publishes the raw track: filtering is worth less here than audio that is either working or
  // visibly broken.
  it('publishes the raw microphone without attaching a processor', async () => {
    const track = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track };
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    expect(mocks.useKrispNoiseFilter).not.toHaveBeenCalled();
    expect(track.setProcessor).not.toHaveBeenCalled();
    // Unmuting still publishes the microphone — it is the filter that is gone, not the audio.
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  it('yields to the tab that owns the voice connection', async () => {
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await waitFor(() => expect(screen.getByText('Voice is active in another tab')).toBeInTheDocument());
    expect(screen.queryByTestId('livekit-room')).toBeNull();
    // The token was never requested by this tab.
    expect(mocks.joinCalls.every(call => !call.enabled)).toBe(true);

    // "Use voice here" asks the owner again; a released lock connects this tab.
    mocks.requestTakeover.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use voice here' }));
    await waitFor(() => expect(screen.getByTestId('livekit-room')).toBeInTheDocument());
  });
});
