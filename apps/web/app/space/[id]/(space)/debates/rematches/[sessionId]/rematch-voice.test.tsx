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
  remoteParticipants: [] as Array<{ identity: string }>,
  /** The published microphone, once there is one — what the noise filter attaches to. */
  microphoneTrack: undefined as { track: Record<string, unknown> } | undefined,
  attachNoiseFilter: vi.fn<
    (
      track: unknown,
      options: { enabled: boolean; isCurrent: () => boolean }
    ) => Promise<{ status: string; processor: object; sourceMediaStreamTrack: object }>
  >(() => Promise.resolve({ status: 'enabled', processor: {}, sourceMediaStreamTrack: {} })),
  unwatchNoiseFilterContext: vi.fn(),
  watchNoiseFilterContext: vi.fn(() => mocks.unwatchNoiseFilterContext),
  setMicrophoneEnabled: vi.fn(),
  isMicrophoneEnabled: true,
  isSpeaking: false,
  localIsSpeaking: false,
  isMuted: false,
  /** Props of every `<LiveKitRoom>` mount, so tests can drive its callbacks. */
  livekitRoomProps: [] as Array<Record<string, unknown>>,
  /** One entry per `<LiveKitRoom>` *mount*, holding the token it connected with. */
  livekitRoomMounts: [] as string[],
  /** Every `useMediaDeviceSelect` call, to prove the picker never re-prompts for the microphone. */
  deviceSelectCalls: [] as Array<{ kind: string; requestPermissions?: boolean }>,
  disconnect: vi.fn(() => Promise.resolve()),
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
  useIsMuted: () => mocks.isMuted,
  useIsSpeaking: (participant?: { identity?: string }) =>
    participant?.identity === 'me' ? mocks.localIsSpeaking : mocks.isSpeaking,
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

vi.mock('~/core/debates/noise-filter', () => ({
  attachNoiseFilter: mocks.attachNoiseFilter,
  watchNoiseFilterContext: mocks.watchNoiseFilterContext,
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
    if (!enabled) return { data: undefined, error: null, isLoading: false };
    return { data: mocks.joinData, error: mocks.joinError, isLoading: mocks.joinLoading };
  },
}));

vi.mock('~/core/debates/media-session', () => ({
  systemDefaultAudioOutput: { deviceId: 'default', groupId: 'default', kind: 'audiooutput', label: 'System default' },
  useDebateMediaSession: () => ({
    selectedAudioInputId: '',
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

beforeEach(() => {
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
  mocks.joinCalls = [];
  mocks.microphoneTrack = undefined;
  mocks.attachNoiseFilter
    .mockReset()
    .mockResolvedValue({ status: 'enabled', processor: {}, sourceMediaStreamTrack: {} });
  mocks.unwatchNoiseFilterContext.mockReset();
  mocks.watchNoiseFilterContext.mockReset().mockReturnValue(mocks.unwatchNoiseFilterContext);
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
  mocks.setMicrophoneEnabled.mockReset();
  mocks.isMicrophoneEnabled = true;
  mocks.isSpeaking = false;
  mocks.localIsSpeaking = false;
  mocks.isMuted = false;
  mocks.livekitRoomProps = [];
  mocks.livekitRoomMounts = [];
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
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
    // Auto-join with a live mic: the room is asked to publish audio from the start.
    expect(mocks.livekitRoomProps[0]?.audio).toBe(true);
    // The ownership lock is namespaced away from real debate ids.
    expect(mocks.coordinatorOptions[0]?.debateId).toBe('rematch:session-1');
  });

  // "Other person is muted → red muted variant; not muted → green unmuted variant" (GEO-2511).
  it('shows the opponent as unmuted once their participant appears', async () => {
    mocks.remoteParticipants = [{ identity: 'them' }];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const chip = screen.getByRole('img', { name: 'Salina is unmuted' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-successTertiary');
    expect(screen.queryByRole('img', { name: /Waiting for/ })).toBeNull();
  });

  it('shows the opponent as muted when they mute themselves', async () => {
    mocks.remoteParticipants = [{ identity: 'them' }];
    mocks.isMuted = true;
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
    mocks.remoteParticipants = [{ identity: 'them' }];
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
    mocks.setMicrophoneEnabled.mockReset();
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
    mocks.remoteParticipants = [{ identity: 'them' }];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const enable = screen.getByRole('button', { name: /enable audio/i });
    fireEvent.click(enable);
    expect(mocks.startAudio).toHaveBeenCalled();
  });

  it('does not ask for a click while audio plays normally', async () => {
    mocks.remoteParticipants = [{ identity: 'them' }];
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

  // `audio` is not a join-time flag: LiveKit replays `setMicrophoneEnabled(!!audio)` on every
  // reconnect, so a hardcoded `true` puts a muted user back on air after a network blip. The mock
  // room cannot replay that, so what is asserted here is the input it would replay.
  it('records mute intent on the room, not just on the local track', async () => {
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);
  });

  // Nothing else clears the failure, so without this a denied microphone means listen-only with a
  // dead mute button until the page is reloaded.
  it('clears the microphone failure when the user retries', async () => {
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeDisabled();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);

    // A drop after connecting retries on its own, and that retry is also the user's second run at
    // the microphone.
    mocks.connectionState = 'disconnected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    await waitFor(() => expect(mocks.livekitRoomMounts).toHaveLength(2));

    mocks.connectionState = 'connected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  // The affected side otherwise has to notice the dock and click, and the other side has nothing
  // to click at all — their screen just shows the room going quiet.
  it('retries on its own when a connected room drops', async () => {
    const session = makeSession('browsing');
    const { rerender, client } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomMounts).toHaveLength(1);
    const reset = vi.spyOn(client, 'resetQueries');

    mocks.connectionState = 'disconnected';
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    await waitFor(() => expect(reset).toHaveBeenCalledWith({ queryKey: TOKEN_QUERY_KEY }));
    await waitFor(() => expect(mocks.livekitRoomMounts).toHaveLength(2));
    // One retry per drop: the fresh room is still coming up, not offering a second Retry.
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText('Connecting voice…')).toBeInTheDocument();
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

  // The dock and the debate room put Krisp in front of the microphone through the same code, so
  // a failure after the swap takes Krisp back off in both rather than publishing its silence.
  it('attaches the shared noise filter once the microphone is published', async () => {
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.attachNoiseFilter).not.toHaveBeenCalled();

    const track = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track };
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    await waitFor(() => expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(1));
    expect(mocks.attachNoiseFilter).toHaveBeenCalledWith(track, { enabled: true, isCurrent: expect.any(Function) });
    // And keeps watching the context it runs on, for as long as this track is the microphone.
    await waitFor(() => expect(mocks.watchNoiseFilterContext).toHaveBeenCalledTimes(1));
    expect(mocks.watchNoiseFilterContext).toHaveBeenCalledWith(track, expect.objectContaining({ status: 'enabled' }));
    expect(mocks.unwatchNoiseFilterContext).not.toHaveBeenCalled();
  });

  // Krisp's worklet runs on the room's audio context, which is the same one autoplay policy
  // blocks. Attaching before playback starts would publish the silence of a suspended context —
  // whereas the raw microphone is on air regardless, so waiting costs only the filtering.
  it('does not attach the noise filter while playback is blocked', async () => {
    mocks.canPlayAudio = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    const track = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track };
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    // The microphone is published and live; only Krisp is waiting.
    expect(mocks.attachNoiseFilter).not.toHaveBeenCalled();

    // "Enable audio" lands, and Krisp goes on from there.
    mocks.canPlayAudio = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    await waitFor(() => expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(1));
  });

  // Playback dipping is not a reason to swap the published track twice more; the context resuming
  // is enough on its own.
  it('does not re-attach the noise filter when playback stops and starts again', async () => {
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    const track = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track };
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    await waitFor(() => expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(1));

    mocks.canPlayAudio = false;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    mocks.canPlayAudio = true;
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(1);
    // And the watch it set up is still the original one.
    expect(mocks.unwatchNoiseFilterContext).not.toHaveBeenCalled();
  });

  // A microphone published again after a reconnect is a new track, and the old attach must not
  // finish against it.
  it('re-attaches the noise filter to a republished microphone and abandons the old attach', async () => {
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoicePill session={session} currentUserId="me" />);
    await flushOwnership();

    const first = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track: first };
    rerender(<RematchVoicePill session={session} currentUserId="me" />);
    await waitFor(() => expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(1));
    const firstIsCurrent = mocks.attachNoiseFilter.mock.calls[0]?.[1]?.isCurrent as () => boolean;
    expect(firstIsCurrent()).toBe(true);

    const second = { mediaStreamTrack: { kind: 'audio' }, setProcessor: vi.fn(), stop: vi.fn() };
    mocks.microphoneTrack = { track: second };
    rerender(<RematchVoicePill session={session} currentUserId="me" />);

    await waitFor(() => expect(mocks.attachNoiseFilter).toHaveBeenCalledTimes(2));
    expect(mocks.attachNoiseFilter).toHaveBeenLastCalledWith(second, expect.anything());
    expect(firstIsCurrent()).toBe(false);
    // The first track's context watch went with it.
    expect(mocks.unwatchNoiseFilterContext).toHaveBeenCalledTimes(1);
  });
});
