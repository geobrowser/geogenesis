import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';

import { PAIR_PILL } from './rematch-pair-header';
import { RematchVoiceHeader } from './rematch-voice';

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
  capture: vi.fn(),
  openSidePanel: vi.fn(),
  spaceLookups: [] as Array<string | undefined>,
  /**
   * What `useSpace` hands back for the opponent's personal space. Null before it resolves.
   *
   * `topicId` matters: `getSpaceSubtopicRootEntityId` prefers a topic that is not the page entity,
   * and falls back to the page for the older personal spaces that never declared one.
   */
  opponentSpace: { topicId: null, entity: { id: 'them-home' } } as {
    topicId: string | null;
    entity: { id: string };
  } | null,
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

vi.mock('~/core/analytics', () => ({
  capture: (...args: unknown[]) => mocks.capture(...args),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: (spaceId?: string) => {
    mocks.spaceLookups.push(spaceId);
    return { space: mocks.opponentSpace, isLoading: false };
  },
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ sidePanelTarget: null, openSidePanel: mocks.openSidePanel, closeSidePanel: vi.fn() }),
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

/**
 * The avatar box in a participant card — the element that carries the speaking ring.
 *
 * The name sits in its own column beside the avatar now (name over caption, or name over mic
 * chip), so the ring is the previous sibling of that column rather than of the name itself.
 */
function avatarFor(name: string) {
  return screen.getByText(name).closest('div')?.previousElementSibling;
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
  mocks.capture.mockReset();
  mocks.openSidePanel.mockReset();
  mocks.spaceLookups = [];
  mocks.opponentSpace = { topicId: null, entity: { id: 'them-home' } };
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
});

describe('RematchVoiceHeader', () => {
  it('draws the pair without any voice once the session leaves a voice-capable status', async () => {
    for (const status of ['deciding', 'converted', 'ended', 'expired'] as const) {
      const { container, unmount } = render(<RematchVoiceHeader session={makeSession(status)} currentUserId="me" />);
      await flushOwnership();
      expect(container.querySelector('[data-testid="livekit-room"]')).toBeNull();
      // The header is the page's header now, not the voice dock: two people are still in this
      // rematch, and the cards are how the page says who. There is just nothing to mute.
      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Salina')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /microphone$/ })).toBeNull();
      unmount();
    }
    // The token endpoint is never even consulted for these.
    expect(mocks.joinCalls.every(call => !call.enabled)).toBe(true);
  });

  it('draws the pair without any voice when the backend has no voice support', async () => {
    for (const error of [
      new GeoChatRequestError('not found', null, 404),
      new GeoChatRequestError('LiveKit is not configured', 'livekit_not_configured', 503),
    ]) {
      mocks.joinError = error;
      mocks.joinData = null;
      const { container, unmount } = render(
        <RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />
      );
      await flushOwnership();
      expect(container.querySelector('[data-testid="livekit-room"]')).toBeNull();
      expect(screen.getByText('Salina')).toBeInTheDocument();
      // Not even a message: there is no voice to be unavailable, and saying so would invent a
      // problem on a picker that works exactly as it did before voice existed.
      expect(screen.queryByText(/Voice is unavailable/)).toBeNull();
      expect(screen.queryByRole('button', { name: /microphone$/ })).toBeNull();
      unmount();
    }
  });

  it('offers a retry when the token fetch fails for an unexpected reason', async () => {
    mocks.joinError = new GeoChatRequestError('boom', null, 500);
    mocks.joinData = null;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByText('Voice is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('connects the room and waits for the opponent when they have not joined yet', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByTestId('livekit-room')).toBeInTheDocument();
    // The design keeps both names on screen throughout; only the opponent's chip changes.
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Salina')).toBeInTheDocument();
    expect(screen.getByTitle('Waiting for Salina to join')).toBeInTheDocument();
    // Auto-join, but muted: the room connects to listen, not to publish.
    expect(mocks.livekitRoomProps[0]?.audio).toBe(false);
    // The ownership lock is namespaced away from real debate ids.
    expect(mocks.coordinatorOptions[0]?.debateId).toBe('rematch:session-1');
  });

  it('keeps the microphone live when the pair arrives from a recorded debate', async () => {
    render(
      <RematchVoiceHeader session={{ ...makeSession('browsing'), source_debate_id: 'debate-1' }} currentUserId="me" />
    );
    await flushOwnership();

    expect(mocks.livekitRoomProps[0]?.audio).toBe(true);
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  it('resets the microphone default when the route moves between rematch sessions', async () => {
    const recordedDebateSession = { ...makeSession('browsing'), source_debate_id: 'debate-1' };
    const view = render(<RematchVoiceHeader session={recordedDebateSession} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);

    view.rerender(
      <RematchVoiceHeader
        session={{ ...makeSession('browsing'), id: 'session-2', source_debate_id: null }}
        currentUserId="me"
      />
    );
    await flushOwnership();

    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);

    view.rerender(
      <RematchVoiceHeader
        session={{ ...makeSession('browsing'), id: 'session-3', source_debate_id: 'debate-2' }}
        currentUserId="me"
      />
    );
    await flushOwnership();

    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  // "Other person is muted → red muted variant; not muted → green unmuted variant" (GEO-2511).
  it('shows the opponent as unmuted once their participant appears', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const chip = screen.getByTitle('Salina is unmuted');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-successTertiary');
    expect(screen.queryByTitle(/Waiting for/)).toBeNull();
  });

  it('shows the opponent as muted when they mute themselves', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    // A speaker update that arrives just before the mute leaves `isSpeaking` set until the next
    // one; the row must not contradict itself in that window.
    mocks.isSpeaking = true;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const chip = screen.getByTitle('Salina is muted');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-errorTertiary');
    expect(avatarFor('Salina')).not.toHaveClass('ring-successTertiary');
  });

  it('rings the speaking participant, whichever side is talking', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.localIsSpeaking = true;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('You')).toHaveClass('ring-successTertiary');
    expect(avatarFor('Salina')).not.toHaveClass('ring-successTertiary');

    cleanup();
    mocks.localIsSpeaking = false;
    mocks.isSpeaking = true;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('Salina')).toHaveClass('ring-successTertiary');
    expect(avatarFor('You')).not.toHaveClass('ring-successTertiary');
  });

  // Muting does not retract the active-speaker update that preceded it, so a stale one would
  // otherwise leave the ring lit on a microphone nobody can hear.
  it('drops the local ring the moment the microphone is off', async () => {
    mocks.localIsSpeaking = true;
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(avatarFor('You')).not.toHaveClass('ring-successTertiary');
  });

  it('mutes and unmutes the local microphone', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false);

    cleanup();
    mocks.isMicrophoneEnabled = false;
    mocks.setMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('stays connected listen-only when the microphone fails', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;

    act(() => onMediaDeviceFailure('NotFound'));
    expect(screen.getByText(/No microphone found/)).toBeInTheDocument();

    act(() => onMediaDeviceFailure('DeviceInUse'));
    expect(screen.getByText(/in use by another app/)).toBeInTheDocument();
  });

  it('recovers from a denied microphone without a page reload', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const enable = screen.getByRole('button', { name: /enable audio/i });
    fireEvent.click(enable);
    expect(mocks.startAudio).toHaveBeenCalled();
  });

  it('does not ask for a click while audio plays normally', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByRole('button', { name: /enable audio/i })).toBeNull();
  });

  // The picked devices have to switch the live call AND survive into the debate that follows, which
  // is the whole reason each choice is written back to the shared media session.
  it('switches the live microphone and carries the choice into the debate', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.click(await screen.findByText('USB Microphone'));

    expect(mocks.setActiveMediaDevice).toHaveBeenCalledWith('mic-b');
    expect(mocks.changeAudioInput).toHaveBeenCalledWith('mic-b');
  });

  it('switches the live speaker and carries the choice into the debate', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.click(await screen.findByText('AirPods'));

    expect(mocks.setActiveSpeaker).toHaveBeenCalledWith('speaker-b');
    expect(mocks.changeAudioOutput).toHaveBeenCalledWith('speaker-b');
  });

  // Firefox and Safari enumerate no outputs at all, and an empty list reads as a broken picker.
  it('falls back to the system default speaker when the browser cannot route audio', async () => {
    mocks.speakerDevices = [];
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    expect(await screen.findByText('System default')).toBeInTheDocument();
  });

  it('opens the audio settings in a bottom sheet on mobile', async () => {
    setMobileLayout(true);
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    const { client, rerender } = render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    rerender(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    expect(mocks.livekitRoomMounts).toEqual(['token-2']);
  });

  // A tab that yielded the mic is still holding the token it minted before it yielded, and five
  // minutes is a very reachable gap between handing the connection over and asking for it back.
  it('re-mints the token when taking the voice connection back from another tab', async () => {
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    const { client } = render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(false);
  });

  // Joining muted means nothing would reach `getUserMedia` until the unmute click, which puts a
  // permission dialog in front of someone who has just started talking.
  it('asks for the microphone up front and hands it straight back', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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

    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledTimes(1));

    // Unmute, then mute again. Both flips run through the `!micIntent` gate, so the prime's
    // `enabled` goes false and back to true — the same shape a takeover handed back or a token
    // retry produces.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });
    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
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
      const { unmount } = render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByTitle('Salina is muted')).toBeInTheDocument();
    expect(avatarFor('Salina')).not.toHaveClass('ring-successTertiary');
  });

  it('lights the opponent ring the moment they unmute and speak', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: false };
    mocks.isSpeaking = true;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByTitle('Salina is talking')).toBeInTheDocument();
    expect(avatarFor('Salina')).toHaveClass('ring-successTertiary');
  });

  // A denied prime is the unmute button's problem, not the dock's: nothing should change on
  // screen until the user actually asks to speak.
  it('says nothing when the up-front prompt is denied', async () => {
    mocks.getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalled());

    expect(screen.queryByText(/Microphone blocked/)).toBeNull();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeEnabled();
  });

  // Muted is the default nobody chose, so the first time the other person actually says something
  // is when it most needs pointing out — and when silence starts reading as being ignored.
  it('names the opponent the first time they speak while the viewer is muted', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();
  });

  // The click that answers the nudge lands in the one window where `isMicrophoneEnabled` is still
  // false — the permission dialog holds it there until the user answers. Waiting on `muted` to
  // clear would leave "You're muted" sitting over the button they just pressed for as long as the
  // dialog is open, so the click has to take the bubble down itself.
  it('takes the nudge down on the unmute click, before the microphone opens', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });

    // Still muted as far as LiveKit is concerned — the dialog has not been answered.
    expect(mocks.isMicrophoneEnabled).toBe(false);
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
    expect(screen.getByTestId('rematch-voice-announcement')).toHaveTextContent('');
  });

  it('leaves an unmuted user alone when the opponent speaks', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.isSpeaking = true;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
  });

  // A nudge that returns on every turn is just a mute button that shouts.
  it('shows the muted nudge once and then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.isMicrophoneEnabled = false;
      mocks.remoteParticipants = [remoteOpponent()];
      const session = makeSession('browsing');
      const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
      await flushOwnership();

      mocks.isSpeaking = true;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

      // Long enough to actually read: still up most of the way to the deadline. Without this the
      // duration is bounded from above only, and a one-frame bubble would pass.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

      // It clears itself...
      await act(async () => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

      // ...and stays gone when they take another turn.
      mocks.isSpeaking = false;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      mocks.isSpeaking = true;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
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
      const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
      await flushOwnership();

      mocks.isSpeaking = true;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

      // They pause a second in, long before the nudge is due to go.
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      mocks.isSpeaking = false;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

      await act(async () => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Once per visit, not once per connection. The dock tears its rows down on every reconnect and
  // every "audio is blocked" detour, so a one-shot held inside them would fire again and again
  // across a single sitting.
  it('does not repeat the muted nudge after a reconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.isMicrophoneEnabled = false;
      mocks.remoteParticipants = [remoteOpponent()];
      const session = makeSession('browsing');
      const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
      await flushOwnership();

      mocks.isSpeaking = true;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

      // Drop and come back, with the opponent talking again on the other side.
      mocks.isSpeaking = false;
      mocks.connectionState = 'reconnecting';
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      mocks.connectionState = 'connected';
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
      mocks.isSpeaking = true;
      rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

      expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
      // Once a visit, whatever the connection did in between.
      expect(mocks.capture.mock.calls.filter(call => call[0] === 'debate_rematch_voice_nudge')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

    // The blip takes the rows down mid-sentence.
    mocks.connectionState = 'reconnecting';
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();

    // Back up, muted, with nobody talking. On remount the local row's effect runs before the
    // opponent row reports afresh, so a value left over from before the blip fires the nudge at
    // a silent room.
    mocks.isSpeaking = false;
    mocks.isMicrophoneEnabled = false;
    mocks.connectionState = 'connected';
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
  });

  // The whole gate, from the other side: every path that renders no dock must also ask for
  // nothing. Without these the gate can widen or narrow without a single test noticing.
  it('never primes the microphone on a session with no voice', async () => {
    // With a token on the table regardless, the voice-capable clause is the only thing that can
    // hold the prime back — otherwise the token check alone closes the gate and this proves
    // nothing about the clause it is named for.
    mocks.joinIgnoresEnabled = true;
    for (const status of ['deciding', 'converted', 'ended', 'expired'] as const) {
      const { unmount } = render(<RematchVoiceHeader session={makeSession(status)} currentUserId="me" />);
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
    const { container } = render(<RematchVoiceHeader session={solo} currentUserId="me" />);
    await flushOwnership();

    expect(container.textContent).toBe('');
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // The tab that does not hold the microphone lock must not open the microphone.
  it('never primes the microphone from a tab that yielded the connection', async () => {
    mocks.joinIgnoresEnabled = true;
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByText('Voice is active in another tab')).toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  // A prompt on a page with no voice UI to explain it is worse than the one the prime moves.
  it('does not prime the microphone when there is no dock to join', async () => {
    mocks.joinData = null;
    mocks.joinError = new GeoChatRequestError('not found', null, 404);
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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

    const { unmount } = render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

    // They walk out mid-sentence.
    mocks.remoteParticipants = [];
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTitle('Waiting for Salina to join')).toBeInTheDocument();

    // The user then mutes. Nobody is here, let alone talking, so nothing should be nudged.
    mocks.isMicrophoneEnabled = false;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
  });

  // A live region inserted with its text already in it is unreliably announced, so the region has
  // to be mounted and empty first and only then change. That ordering is the fix, and it is what
  // this pins.
  it('announces the muted nudge from a region that was already mounted', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    // Present before there is anything to say.
    expect(screen.getByTestId('rematch-voice-announcement')).toHaveTextContent('');
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();

    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

    const region = screen.getByTestId('rematch-voice-announcement');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent('Salina is talking. Unmute to reply.');
    // The toast is not a second live region: it carries real buttons, and `aria-hidden` over a
    // focusable control hides the only way to act on what was just announced.
    expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).not.toHaveAttribute('aria-hidden');
  });

  // A mute the user can undo by clicking gets the filled call-to-action; a dead microphone is not
  // that, and collapsing the two would send people clicking at a button that cannot help them.
  it('distinguishes a broken microphone from a chosen mute', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toHaveClass('bg-text');

    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));

    const failed = screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ });
    expect(failed).not.toHaveClass('bg-text');
    expect(failed).toHaveClass('opacity-60');
    // And the card says why, next to the only way back.
    expect(screen.getByText(/Microphone blocked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // The nudge exists to get the microphone opened, and it now carries its own way of doing that
  // rather than pointing at a control elsewhere on the page.
  it('unmutes from the nudge itself', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute to reply' }));
    });

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
  });

  // Unmuting is what the nudge was asking for; leaving it up afterwards is noise.
  it('drops the muted nudge as soon as the user unmutes', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-voice-toast-opponent-talking')).toBeInTheDocument();

    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-voice-toast-opponent-talking')).toBeNull();
  });

  // Muted is the state users arrive in without choosing it, and the whole point of GEO-2992 is
  // that the way out of it reads as a button. An icon on a tertiary wash read as a status light,
  // which is why nobody pressed it: a verb on a filled pill does not.
  it('labels the way out of a mute nobody chose', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    const button = screen.getByRole('button', { name: 'Unmute microphone' });
    expect(button).toHaveTextContent('Unmute');
    expect(button).toHaveClass('bg-text', 'text-white');
  });

  // The button is the state as well as the action: a filled "Unmute" is a microphone that is off,
  // an outlined "Mute" is one that is on. A caption saying the same thing beside it is the fact
  // twice over, and reads as though the two could disagree.
  it('lets the button carry the viewer mic state, with no caption repeating it', async () => {
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    /** Text the viewer can actually see — the state also lives in an `sr-only` live region. */
    function visibleText(text: string) {
      const card = screen.getByTestId('rematch-you-card');
      return within(card)
        .queryAllByText(text)
        .filter(element => !element.classList.contains('sr-only'));
    }

    const card = screen.getByTestId('rematch-you-card');
    expect(within(card).getByRole('button', { name: 'Unmute microphone' })).toHaveTextContent('Unmute');
    expect(visibleText('Muted')).toHaveLength(0);

    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(within(card).getByRole('button', { name: 'Mute microphone' })).toHaveTextContent('Mute');
    expect(visibleText('Unmuted')).toHaveLength(0);
    expect(visibleText('Live')).toHaveLength(0);
  });

  // Dropping the visible caption cannot drop the announcement with it. The microphone mutes on its
  // own — a reconnect, a takeover, a device failure — and a button's `aria-label` flipping is not
  // reliably read unless it happens to be focused.
  it('still announces the viewer mic state after the caption is gone', async () => {
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    const region = screen.getByTestId('rematch-you-state');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent('Muted');

    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    // The same region, with new text — a live region inserted with its content already in it is
    // dropped often enough to be unreliable.
    expect(screen.getByTestId('rematch-you-state')).toHaveTextContent('Unmuted');
  });

  // What the button cannot say still gets said. These are the states that arrive without the
  // viewer doing anything, and the pill looks the same through all of them.
  it('captions the viewer card only for what the button cannot express', async () => {
    mocks.connectionState = 'reconnecting';
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(within(screen.getByTestId('rematch-you-card')).getByText('Reconnecting…')).toBeInTheDocument();

    mocks.connectionState = 'connected';
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    const onMediaDeviceFailure = mocks.livekitRoomProps[0]?.onMediaDeviceFailure as (failure?: string) => void;
    act(() => onMediaDeviceFailure('PermissionDenied'));
    expect(screen.getByText(/Microphone blocked/)).toBeInTheDocument();
  });

  // GEO-2992: the opponent's card is a way into their space, and the only control in the header is
  // the pill in the other card. Collapsing the two would make every glance at the mic state a
  // navigation.
  it('opens the opponent personal space from their card, and only from their card', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Open Salina’s personal space' }));
    expect(mocks.openSidePanel).toHaveBeenCalledWith('them-home', 'them-space', false, { forceRequestedSpace: true });

    mocks.openSidePanel.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ }));
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  // The space lookup is a request like any other, and a click can land before it does. The shared
  // hook remembers that click and finishes it once the entity arrives — a hand-rolled copy of the
  // rule instead left the card doing nothing at all for as long as the lookup took.
  //
  // What it must not do is open the space id: that id is the personal space's system entity, an
  // ugly technical record rather than the person (#2549).
  it('finishes an opponent card click that lands before their space resolves', async () => {
    mocks.opponentSpace = null;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    fireEvent.click(screen.getByRole('button', { name: 'Open Salina’s personal space' }));
    expect(mocks.openSidePanel).not.toHaveBeenCalled();

    mocks.opponentSpace = { topicId: null, entity: { id: 'them-home' } };
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(mocks.openSidePanel).toHaveBeenCalledWith('them-home', 'them-space', false, { forceRequestedSpace: true });
  });

  // The prompt the corner dock never had: nothing on that page said you were in a live room with
  // another person, which is the fact that makes the mute default worth acting on.
  it('offers the unmute notice while muted, once', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    const notice = screen.getByTestId('rematch-unmute-notice');
    // The first name, not the display handle: this is the page addressing the viewer about a
    // person, and a handle mid-sentence reads like a username.
    expect(notice).toHaveTextContent('You’re in a live room with Salina. Unmute to talk while you pick a claim.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('rematch-unmute-notice')).toBeNull();

    // Still muted, still in the room — and it stays gone.
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-unmute-notice')).toBeNull();
  });

  it('drops the unmute notice once the user unmutes, and does not bring it back on a later mute', async () => {
    mocks.isMicrophoneEnabled = false;
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByTestId('rematch-unmute-notice')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });
    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-unmute-notice')).toBeNull();

    // Muting on purpose is a choice, not the join default the notice exists to explain.
    mocks.isMicrophoneEnabled = false;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.queryByTestId('rematch-unmute-notice')).toBeNull();
  });

  // Nobody to talk to is not a live room, and the notice would be describing one that isn't there.
  it('withholds the unmute notice until the opponent joins the room', async () => {
    mocks.isMicrophoneEnabled = false;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.queryByTestId('rematch-unmute-notice')).toBeNull();

    mocks.remoteParticipants = [remoteOpponent()];
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-unmute-notice')).toBeInTheDocument();
  });

  // The opponent's card earns a "Talking" state of its own: on the dock this was a ring around an
  // avatar, which says nothing to anyone reading the words.
  it('says when the opponent is talking, not only that they are unmuted', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByTitle('Salina is unmuted')).toHaveTextContent('Unmuted');

    mocks.isSpeaking = true;
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTitle('Salina is talking')).toHaveTextContent('Talking');
  });

  /** The identity row's three tracks: avatar, the name-and-state column, the corner action. */
  function cardTracks(card: HTMLElement) {
    return Array.from((card.firstElementChild as HTMLElement).children) as HTMLElement[];
  }

  // The two cards sit side by side, so a difference in either one is a difference you read across
  // the pair. The mute pill had drifted out to the card's left edge while the opponent's chip
  // stayed indented under their name — invisible in either card alone, impossible to miss between
  // them. Both are laid out by one component now, and this is what says so.
  it('lays both cards out the same way, avatar then name over state then the corner action', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    render(
      <RematchVoiceHeader
        session={makeSession('browsing')}
        currentUserId="me"
        leaveAction={<button type="button">Leave debate</button>}
      />
    );
    await flushOwnership();

    const you = screen.getByTestId('rematch-you-card');
    const them = screen.getByTestId('rematch-opponent-card');

    // Them, the badge, then you: the home side of a scoreboard, and where a reader's eye lands
    // last. Order is not decoration here — the cards are identical, so position is the only thing
    // saying which of them is you.
    expect(them.compareDocumentPosition(you) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(them.parentElement!.children).map(child => child.textContent)).toEqual([
      expect.stringContaining('Salina'),
      'VS',
      expect.stringContaining('You'),
    ]);

    const [youAvatar, youColumn, youAction] = cardTracks(you);
    const [themAvatar, themColumn, themAction] = cardTracks(them);

    expect(youAvatar.className).toBe(themAvatar.className);
    expect(youColumn.className).toBe(themColumn.className);
    expect(youAction.className).toBe(themAction.className);

    // The state belongs to the name, not to the card: the pill is indented past the avatar exactly
    // as far as the chip is.
    expect(youColumn).toContainElement(within(you).getByText('You'));
    expect(youColumn).toContainElement(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ }));
    expect(themColumn).toContainElement(within(them).getByText('Salina'));
    expect(themColumn).toContainElement(screen.getByTitle('Salina is muted'));

    // And the corners hold each person's own secondary action, so they line up across the badge.
    expect(youAction).toContainElement(screen.getByRole('button', { name: 'Leave debate' }));
    expect(themAction).toHaveTextContent('View profile');
  });

  // Your control and their chip sit at the same height in mirrored cards, so anything they do not
  // share reads as an accident rather than a decision. They were two hand-written sets of paddings
  // and type sizes that were close but not equal; this is what keeps them from drifting apart
  // again.
  it('gives the mute button and the opponent chip the same shape', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    const button = screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ });
    const chip = screen.getByTitle('Salina is muted');
    for (const shared of PAIR_PILL.split(' ')) {
      expect(button).toHaveClass(shared);
      expect(chip).toHaveClass(shared);
    }

    // The corners are the one difference, and it is the real one: the chip is a whole pill, the
    // button is the left half of one with the settings chevron making up the right.
    expect(button).toHaveClass('rounded-l-full');
    expect(chip).toHaveClass('rounded-full');
    expect(screen.getByRole('button', { name: 'Audio settings' })).toHaveClass('size-6', 'rounded-r-full');
  });

  // Leaving belongs to you, so it sits in your card — opposite "View profile" on theirs — and the
  // tab strip gets back the width it was sharing.
  it('draws the leave action in the viewer card, beside the mic control rather than in its place', async () => {
    render(
      <RematchVoiceHeader
        session={makeSession('browsing')}
        currentUserId="me"
        leaveAction={<button type="button">Leave debate</button>}
      />
    );
    await flushOwnership();

    const card = screen.getByTestId('rematch-you-card');
    const leave = screen.getByRole('button', { name: 'Leave debate' });
    const mic = screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ });
    expect(card).toContainElement(leave);
    expect(card).toContainElement(mic);
    // The pill has its own row under the name; sharing the identity row left it a half-card wide.
    expect(leave.closest('div')).not.toBe(mic.closest('div'));
  });

  // The session is still leavable when there is nobody to draw a pair with.
  it('keeps the leave action reachable without an opponent', async () => {
    const session = makeSession('browsing');
    const solo = { ...session, participants: [session.participants[0]] };
    render(
      <RematchVoiceHeader session={solo} currentUserId="me" leaveAction={<button type="button">Leave debate</button>} />
    );
    await flushOwnership();

    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeInTheDocument();
    expect(screen.queryByTestId('rematch-you-card')).toBeNull();
  });

  // The card opens a person, so it says so — "space" is the plumbing, not what the viewer wants.
  it('offers the opponent card as a way into their profile', async () => {
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(screen.getByRole('button', { name: 'Open Salina’s personal space' })).toHaveTextContent('View profile');
  });

  /** A locked pairing: the pair have agreed a claim and each holds a side. */
  function lockedSession(): DebateRematchSession {
    const session = makeSession('request_pending');
    return {
      ...session,
      request: {
        id: 'request-1',
        status: 'pending',
        claim: {
          id: 'claim-1',
          space_id: 'space-1',
          claim_entity_id: 'claim-entity-1',
          claim: 'A man should always pay for the first date',
          description: null,
        },
        requester_user_id: 'me',
        recipient_user_id: 'them',
        requester_position: true,
        recipient_position: false,
        turn_format_id: 'format-1',
        created_at: '2026-08-27T00:00:00Z',
        expires_at: '2026-08-27T00:05:00Z',
      },
    };
  }

  // The card is a `<button>` with an explicit `aria-label`, and a control's label replaces its
  // descendant text in the accessible name — so the mic chip is invisible to a screen reader from
  // inside it. A `role="status"` nested in a button does not save it either: a button's descendants
  // are presentational, so the role, and the implicit `aria-live` with it, is stripped. The dock
  // this replaced had the chip in a plain row, where both worked.
  it('announces the opponent mic state from outside their card button', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    const card = screen.getByTestId('rematch-opponent-card');
    const status = screen.getByTestId('rematch-opponent-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Salina is muted');
    expect(card).not.toContainElement(status);

    // And the card points at it, so focusing the control says who is muted rather than only what
    // pressing it does. The label itself stays put — a control that renames itself every time the
    // other person mutes is harder to use than one that is quiet.
    expect(card).toHaveAttribute('aria-describedby', status.id);
    expect(card).toHaveAttribute('aria-label', 'Open Salina’s personal space');

    mocks.opponentMicPublication = { isMuted: false };
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-opponent-status')).toHaveTextContent('Salina is unmuted');
    expect(screen.getByTestId('rematch-opponent-card')).toHaveAttribute('aria-label', 'Open Salina’s personal space');
  });

  // The header used to grow a claim heading and two position chips the moment a request went out,
  // pushing everything under it down at exactly the moment the viewer was watching for an answer.
  // That belongs in a card in the content — see `RematchRequestCard` — not in the sticky block.
  it('holds its shape when the pair lock a claim', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: true };
    const browsing = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={browsing} currentUserId="me" />);
    await flushOwnership();
    const before = screen.getByTestId('rematch-you-card').className;

    rerender(<RematchVoiceHeader session={lockedSession()} currentUserId="me" />);

    expect(screen.queryByText('A man should always pay for the first date')).toBeNull();
    expect(screen.queryByText('Agree')).toBeNull();
    expect(screen.queryByText('Disagree')).toBeNull();
    expect(screen.getByTestId('rematch-you-card').className).toBe(before);
    // The control the header exists for is untouched by the lock.
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeInTheDocument();
  });

  // Leaving ends the session, and an ended session is not voice-capable — so the controls used to
  // tear themselves down in the second before the redirect landed, collapsing the card in front of
  // someone who had already left.
  it('keeps the controls while the viewer is on their way out', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    const browsing = makeSession('browsing');
    const { rerender } = render(
      <RematchVoiceHeader
        session={browsing}
        currentUserId="me"
        leaveAction={<button type="button">Leave debate</button>}
      />
    );
    await flushOwnership();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeInTheDocument();

    // What leaving does: the session comes back ended, and the page says it is on its way out.
    rerender(
      <RematchVoiceHeader
        session={makeSession('ended')}
        currentUserId="me"
        leaveAction={<button type="button">Leave debate</button>}
        exiting
      />
    );

    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeInTheDocument();
  });

  // A dropped room on the way out is the same layout shift wearing a different hat, and "Retry" is
  // an offer of something the viewer has just declined.
  it('does not swap in a connection message while leaving', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    mocks.connectionState = 'disconnected';
    rerender(<RematchVoiceHeader session={makeSession('ended')} currentUserId="me" exiting />);

    expect(screen.queryByText('Voice disconnected')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: /^(Mute|Unmute) microphone$/ })).toBeInTheDocument();
  });

  // A hover variant outranks a plain utility on specificity whichever order they are written in,
  // so an unconditional `hover:border-grey-03` erased the talking outline exactly while the viewer
  // was pointing at the card — the one moment they are most likely to be looking at it.
  it('keeps the talking outline on the opponent card under the pointer', async () => {
    mocks.remoteParticipants = [remoteOpponent()];
    mocks.opponentMicPublication = { isMuted: false };
    mocks.isSpeaking = true;
    const session = makeSession('browsing');
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();

    const card = screen.getByTestId('rematch-opponent-card');
    expect(card).toHaveClass('border-green', 'hover:border-green');
    expect(card).not.toHaveClass('hover:border-grey-03');

    // And the ordinary card still lifts to grey under the pointer.
    mocks.isSpeaking = false;
    mocks.opponentMicPublication = { isMuted: true };
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    expect(screen.getByTestId('rematch-opponent-card')).toHaveClass('border-grey-02', 'hover:border-grey-03');
  });

  // GEO-2992 instrumentation: the share of participants who ever unmute, and how long it takes
  // them, read against the corner dock this replaced.
  it('records joining and the first unmute', async () => {
    mocks.isMicrophoneEnabled = false;
    const { rerender } = render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();

    expect(mocks.capture).toHaveBeenCalledWith('debate_rematch_voice_joined', {
      session_id: 'session-1',
      surface: 'pair_header',
      joined_muted: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });
    // Nothing yet: the click is a request, and a denied or busy device never opens.
    expect(mocks.capture.mock.calls.filter(call => call[0] === 'debate_rematch_voice_unmuted')).toHaveLength(0);

    mocks.isMicrophoneEnabled = true;
    rerender(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);

    const unmuted = mocks.capture.mock.calls.filter(call => call[0] === 'debate_rematch_voice_unmuted');
    expect(unmuted).toHaveLength(1);
    expect(unmuted[0][1]).toMatchObject({ session_id: 'session-1', surface: 'pair_header' });
    expect(typeof unmuted[0][1].seconds_to_first_unmute).toBe('number');
  });

  // A pair carried over from a recorded debate arrive with the microphone already open, so their
  // first mute-then-unmute is not somebody discovering the control. Counting it would put the
  // measurement's denominator and numerator in different populations.
  it('does not count an unmute from a pair who arrived unmuted', async () => {
    const carriedOver = { ...makeSession('browsing'), source_debate_id: 'debate-1' };
    const { rerender } = render(<RematchVoiceHeader session={carriedOver} currentUserId="me" />);
    await flushOwnership();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    });
    mocks.isMicrophoneEnabled = false;
    rerender(<RematchVoiceHeader session={carriedOver} currentUserId="me" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    });

    expect(mocks.capture.mock.calls.filter(call => call[0] === 'debate_rematch_voice_unmuted')).toHaveLength(0);
  });

  // `audio` is not a join-time flag: LiveKit replays `setMicrophoneEnabled(!!audio)` on every
  // reconnect, so an intent recorded only on the local track is undone by a network blip — and
  // with the dock joining muted, that blip re-mutes someone who deliberately chose to speak. The
  // mock room cannot replay that, so what is asserted here is the input it would replay.
  it('records mic intent on the room, not just on the local track', async () => {
    mocks.isMicrophoneEnabled = false;
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
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
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    mocks.connectionState = 'connected';
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);
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
    const { rerender } = render(<RematchVoiceHeader session={session} currentUserId="me" />);
    await flushOwnership();
    rerender(<RematchVoiceHeader session={session} currentUserId="me" />);

    expect(mocks.useKrispNoiseFilter).not.toHaveBeenCalled();
    expect(track.setProcessor).not.toHaveBeenCalled();
    // Unmuting still publishes the microphone — it is the filter that is gone, not the audio.
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(mocks.livekitRoomProps.at(-1)?.audio).toBe(true);
  });

  it('yields to the tab that owns the voice connection', async () => {
    mocks.acquireResult = { acquired: false, waitedForLocalRelease: false };
    mocks.requestTakeover.mockResolvedValue(false);
    render(<RematchVoiceHeader session={makeSession('browsing')} currentUserId="me" />);
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
