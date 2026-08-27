import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';

import type { ReactElement } from 'react';

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
  coordinatorOptions: [] as Array<{ debateId: string; userId: string }>,
  connectionState: 'connected',
  canPlayAudio: true,
  startAudio: vi.fn(() => Promise.resolve()),
  remoteParticipants: [] as Array<{ identity: string }>,
  setMicrophoneEnabled: vi.fn(),
  isMicrophoneEnabled: true,
  isSpeaking: false,
  isMuted: false,
  /** Props of every `<LiveKitRoom>` mount, so tests can drive its callbacks. */
  livekitRoomProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: Record<string, unknown>) => {
    mocks.livekitRoomProps.push(props);
    return <div data-testid="livekit-room">{props.children as ReactElement}</div>;
  },
  RoomAudioRenderer: () => null,
  useAudioPlayback: () => ({ canPlayAudio: mocks.canPlayAudio, startAudio: mocks.startAudio }),
  useConnectionState: () => mocks.connectionState,
  useIsMuted: () => mocks.isMuted,
  useIsSpeaking: () => mocks.isSpeaking,
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: mocks.setMicrophoneEnabled },
    isMicrophoneEnabled: mocks.isMicrophoneEnabled,
  }),
  useRemoteParticipants: () => mocks.remoteParticipants,
  useRoomContext: () => ({ disconnect: vi.fn(() => Promise.resolve()) }),
}));

vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({ setNoiseFilterEnabled: vi.fn(() => Promise.resolve()) }),
}));

vi.mock('livekit-client', () => ({
  ConnectionState: {
    Connected: 'connected',
    Connecting: 'connecting',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    SignalReconnecting: 'signalReconnecting',
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
  useDebateMediaSession: () => ({ selectedAudioInputId: '' }),
}));

vi.mock('~/core/debates/debate-room-ownership', () => ({
  createDebateRoomOwnershipCoordinator: (options: { debateId: string; userId: string }) => {
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

function render(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

async function flushOwnership() {
  // The ownership effect resolves acquire() in a microtask before anything voice renders.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.joinData = {
    token: 'token-1',
    url: 'wss://livekit.test',
    room_name: 'geo-rematch-session-1',
    participant_slot: 1,
  };
  mocks.joinError = null;
  mocks.joinLoading = false;
  mocks.joinCalls = [];
  mocks.acquireResult = { acquired: true, waitedForLocalRelease: false };
  mocks.requestTakeover.mockReset().mockResolvedValue(false);
  mocks.release.mockReset().mockResolvedValue(undefined);
  mocks.close.mockReset();
  mocks.coordinatorOptions = [];
  mocks.connectionState = 'connected';
  mocks.canPlayAudio = true;
  mocks.startAudio.mockReset().mockResolvedValue(undefined);
  mocks.remoteParticipants = [];
  mocks.setMicrophoneEnabled.mockReset();
  mocks.isMicrophoneEnabled = true;
  mocks.isSpeaking = false;
  mocks.isMuted = false;
  mocks.livekitRoomProps = [];
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
    expect(screen.getByText('Waiting for Salina')).toBeInTheDocument();
    // Auto-join with a live mic: the room is asked to publish audio from the start.
    expect(mocks.livekitRoomProps[0]?.audio).toBe(true);
    // The ownership lock is namespaced away from real debate ids.
    expect(mocks.coordinatorOptions[0]?.debateId).toBe('rematch:session-1');
  });

  it('shows the opponent once their participant appears', async () => {
    mocks.remoteParticipants = [{ identity: 'them' }];
    render(<RematchVoicePill session={makeSession('browsing')} currentUserId="me" />);
    await flushOwnership();
    expect(screen.getByText('Salina')).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
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
    const muteButton = screen.getByRole('button', { name: /microphone/i });
    expect(muteButton).toBeDisabled();
    expect(muteButton).toHaveAttribute('title', 'Microphone unavailable — check browser permissions');
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
