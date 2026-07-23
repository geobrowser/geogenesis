import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateRematchSession } from '~/core/debates/api';

import { DebateRoomPageClient } from './debate-room-page-client';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  consentMutateAsync: vi.fn(),
  leaveRematchMutateAsync: vi.fn(),
  enqueueRecording: vi.fn(),
  getRecording: vi.fn(),
  deleteRecording: vi.fn(),
  requestPersistentStorage: vi.fn(),
  estimateStorage: vi.fn(),
  mediaRecorderStart: vi.fn(),
  mediaRecorderConstruct: vi.fn(),
  readyMutateAsync: vi.fn(),
  liveKitJoinMutateAsync: vi.fn(),
  markJoinedMutateAsync: vi.fn(),
  createLocalTracks: vi.fn(),
  krispNoiseFilter: vi.fn(),
  krispSupported: vi.fn(),
  krispSetEnabled: vi.fn(),
  krispIsEnabled: vi.fn(),
  roomConnect: vi.fn(),
  roomDisconnect: vi.fn(),
  publishTrack: vi.fn(),
  getServerTime: vi.fn(),
  refetchDebate: vi.fn(),
  clearTimedOutDebateActivity: vi.fn(),
  roomOn: vi.fn(),
  ownershipAcquire: vi.fn(),
  ownershipRequestTakeover: vi.fn(),
  ownershipRelease: vi.fn(),
  ownershipClose: vi.fn(),
  ownershipTakeoverHandler: null as null | (() => boolean | Promise<boolean>),
  debate: null as Debate | null,
  rematch: null as DebateRematchSession | null,
  featureFlags: {
    questionsTab: true,
    debateDebugging: false,
  } as Record<string, boolean>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => mocks.featureFlags[id] ?? false,
  useDebatesEnabled: () => mocks.featureFlags['questionsTab'] ?? false,
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();

  return {
    ...actual,
    getCurrentGeoChatUserId: () => 'user-a',
    getServerTime: mocks.getServerTime,
  };
});

vi.mock('~/core/debates/hooks', () => ({
  useAbortDebate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearTimedOutDebateActivity: () => mocks.clearTimedOutDebateActivity,
  useConsentToDebateRematch: () => ({ mutateAsync: mocks.consentMutateAsync, isPending: false }),
  useDebate: () => ({ data: mocks.debate, isLoading: false, error: null, refetch: mocks.refetchDebate }),
  useDebateRematch: () => ({ data: mocks.rematch, isLoading: false, error: null }),
  useLeaveDebateRematch: () => ({ mutateAsync: mocks.leaveRematchMutateAsync, isPending: false }),
  useLiveKitJoin: () => ({ mutateAsync: mocks.liveKitJoinMutateAsync, isPending: false }),
  useMarkDebateJoined: () => ({ mutateAsync: mocks.markJoinedMutateAsync, isPending: false }),
  useMarkDebateReady: () => ({ mutateAsync: mocks.readyMutateAsync, isPending: false }),
}));

vi.mock('~/core/debates/recording-upload-queue', () => ({
  debateRecordingUploadId: (userId: string, debateId: string) => `${userId}:${debateId}`,
  deleteDebateRecordingUpload: mocks.deleteRecording,
  enqueueDebateRecordingUpload: mocks.enqueueRecording,
  estimateRecordingStorage: mocks.estimateStorage,
  getDebateRecordingUpload: mocks.getRecording,
  isStorageQuotaError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError',
  requestPersistentRecordingStorage: mocks.requestPersistentStorage,
}));

vi.mock('~/core/debates/debate-room-ownership', () => ({
  createDebateRoomOwnershipCoordinator: (options: { onTakeoverRequested: () => boolean | Promise<boolean> }) => {
    mocks.ownershipTakeoverHandler = options.onTakeoverRequested;
    return {
      instanceId: 'connection-instance-1',
      acquire: mocks.ownershipAcquire,
      requestTakeover: mocks.ownershipRequestTakeover,
      release: mocks.ownershipRelease,
      close: mocks.ownershipClose,
      ownsConnection: () => true,
    };
  },
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  Room: class {
    localParticipant = {
      publishTrack: mocks.publishTrack,
    };

    on = mocks.roomOn;
    connect = mocks.roomConnect;
    disconnect = mocks.roomDisconnect;
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantConnected: 'participantConnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  DisconnectReason: {
    CLIENT_INITIATED: 1,
    DUPLICATE_IDENTITY: 2,
  },
}));

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: mocks.krispSupported,
  KrispNoiseFilter: mocks.krispNoiseFilter,
}));

function emitRoomEvent(event: string, payload?: unknown) {
  for (const [registeredEvent, callback] of mocks.roomOn.mock.calls) {
    if (registeredEvent === event) callback(payload);
  }
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.consentMutateAsync.mockReset();
  mocks.leaveRematchMutateAsync.mockReset();
  mocks.enqueueRecording.mockReset();
  mocks.getRecording.mockReset();
  mocks.deleteRecording.mockReset().mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockReset();
  mocks.estimateStorage.mockReset();
  mocks.mediaRecorderStart.mockReset();
  mocks.mediaRecorderConstruct.mockReset();
  mocks.readyMutateAsync.mockReset();
  mocks.liveKitJoinMutateAsync.mockReset();
  mocks.markJoinedMutateAsync.mockReset();
  mocks.createLocalTracks.mockReset();
  mocks.krispNoiseFilter.mockReset();
  mocks.krispSupported.mockReset().mockReturnValue(true);
  mocks.krispSetEnabled.mockReset().mockResolvedValue(undefined);
  mocks.krispIsEnabled.mockReset().mockReturnValue(true);
  mocks.roomConnect.mockReset();
  mocks.roomDisconnect.mockReset();
  mocks.publishTrack.mockReset();
  mocks.getServerTime.mockReset();
  mocks.refetchDebate.mockReset();
  mocks.clearTimedOutDebateActivity.mockReset();
  mocks.roomOn.mockReset();
  mocks.ownershipAcquire.mockReset().mockResolvedValue(true);
  mocks.ownershipRequestTakeover.mockReset().mockResolvedValue(true);
  mocks.ownershipRelease.mockReset();
  mocks.ownershipClose.mockReset();
  mocks.ownershipTakeoverHandler = null;
  mocks.debate = completedDebate();
  mocks.rematch = null;
  mocks.featureFlags = {
    questionsTab: true,
    debateDebugging: false,
  };
  mocks.readyMutateAsync.mockResolvedValue(readyDebate({ localReady: true, remoteReady: false }));
  mocks.liveKitJoinMutateAsync.mockResolvedValue({
    token: 'livekit-token',
    url: 'wss://livekit.test',
    room_name: 'geo-debate-debate-1',
    role: 'participant',
    participant_slot: 1,
    position: true,
    position_label: 'Yes',
  });
  mocks.krispNoiseFilter.mockImplementation(() => ({
    processedTrack: { kind: 'audio', enabled: true, id: 'krisp-processed-audio' },
    setEnabled: mocks.krispSetEnabled,
    isEnabled: mocks.krispIsEnabled,
  }));
  mocks.createLocalTracks.mockResolvedValue([
    createLocalAudioTrack(),
    { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
  ]);
  mocks.roomConnect.mockResolvedValue(undefined);
  mocks.publishTrack.mockResolvedValue(undefined);
  mocks.getServerTime.mockImplementation(() => Promise.resolve({ server_time_ms: Date.now() }));
  mocks.refetchDebate.mockResolvedValue(undefined);
  mocks.enqueueRecording.mockResolvedValue(undefined);
  mocks.getRecording.mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockResolvedValue(true);
  mocks.estimateStorage.mockResolvedValue({ quota: 1_000_000_000, usage: 0 });
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(public tracks: Array<{ kind?: string }> = []) {}

      getTracks() {
        return this.tracks;
      }

      getAudioTracks() {
        return this.tracks.filter(track => track.kind === 'audio');
      }

      getVideoTracks() {
        return this.tracks.filter(track => track.kind === 'video');
      }
    }
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(new MediaStream()),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Shure MV7+' },
        { kind: 'audioinput', deviceId: 'mic-2', label: 'Studio Mic' },
        { kind: 'videoinput', deviceId: 'camera-1', label: 'HD Pro Webcam' },
        { kind: 'videoinput', deviceId: 'camera-2', label: 'Desk Camera' },
      ]),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DebateRoomPageClient', () => {
  it('shows the pre-screen while the debate is waiting for readiness', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.getByText('Debate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByText('Waiting...')).toBeInTheDocument();
    expect(screen.queryByText('Not ready')).not.toBeInTheDocument();
    expect(screen.queryByText('VS')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Debate recording' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalled();
    });
    expect(mocks.requestPersistentStorage).toHaveBeenCalledOnce();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
  });

  it('starts the camera preview after the Strict Mode effect rehearsal', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(
      <StrictMode>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </StrictMode>
    );

    await waitFor(() => expect(screen.queryByText('Starting camera...')).not.toBeInTheDocument());
    expect(document.querySelector('video')?.srcObject).toBeInstanceOf(MediaStream);
  });

  it('locks background scrolling while the pre-screen modal is open', () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const { unmount } = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('lets participants choose microphone and camera devices from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Select microphone' })).toHaveValue('mic-1');
    });
    expect(screen.getByRole('combobox', { name: 'Select camera' })).toHaveValue('camera-1');

    fireEvent.change(screen.getByRole('combobox', { name: 'Select microphone' }), { target: { value: 'mic-2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Select camera' }), { target: { value: 'camera-2' } });

    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-1' },
      });
    });
    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-2' },
      });
    });
  });

  it('shows the opponent as ready while the local participant can still become ready', () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: true });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('disables the ready button while waiting for the opponent', () => {
    mocks.debate = readyDebate({ localReady: true, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
    expect(screen.getAllByText('Waiting...')).toHaveLength(2);
  });

  it('marks the local participant ready from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(mocks.readyMutateAsync).toHaveBeenCalled();
    });
  });

  it('connects to LiveKit once the debate leaves the ready pre-screen', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => {
      expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mocks.markJoinedMutateAsync).toHaveBeenCalled();
    });
    // markJoined fires before publishTrack, so slow WebRTC media negotiation can't push us past
    // the connecting deadline while both participants are already in the room.
    const joinedCallOrder = mocks.markJoinedMutateAsync.mock.invocationCallOrder[0];
    expect(mocks.publishTrack).toHaveBeenCalledTimes(2);
    expect(mocks.publishTrack.mock.invocationCallOrder.every(callOrder => callOrder > joinedCallOrder)).toBe(true);
  });

  it('does not mint a token when another tab owns the participant connection', async () => {
    mocks.ownershipAcquire.mockResolvedValue(false);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('This debate is already open in another tab.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue here' })).toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
    expect(mocks.roomConnect).not.toHaveBeenCalled();
  });

  it('takes over a connection-phase debate before minting a new token', async () => {
    mocks.ownershipAcquire.mockResolvedValue(false);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue here' }));

    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.ownershipRequestTakeover.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.liveKitJoinMutateAsync.mock.invocationCallOrder[0]
    );
  });

  it('disconnects an in-flight LiveKit room before handing ownership to another tab', async () => {
    const pendingConnection = deferred<void>();
    mocks.roomConnect.mockReturnValue(pendingConnection.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());

    await expect(Promise.resolve(mocks.ownershipTakeoverHandler?.())).resolves.toBe(true);
    expect(mocks.roomDisconnect).toHaveBeenCalledOnce();

    pendingConnection.resolve();
  });

  it('does not allow a secondary tab to take over an active debate recording', async () => {
    mocks.ownershipAcquire.mockResolvedValue(false);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('This debate is already open in another tab.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue here' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Continue the debate in the original tab or device to preserve its recording.')
    ).toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
  });

  it('does not hand off a stale preflight after the first turn has started locally', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:09.000Z'));
    const monotonicNow = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'preflight',
      preflight_ends_at: '2026-07-02T00:00:10.000Z',
      started_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.getServerTime).toHaveBeenCalledTimes(3));

    // Cross the boundary without advancing React's 500ms countdown timer. The ownership callback
    // must compare against the clock directly instead of trusting the last rendered status.
    now.mockReturnValue(Date.parse('2026-07-02T00:00:11.000Z'));
    monotonicNow.mockReturnValue(3_000);
    await expect(Promise.resolve(mocks.ownershipTakeoverHandler?.())).resolves.toBe(false);
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
  });

  it('retries publishing when the media engine is slow to connect', async () => {
    vi.useFakeTimers();
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    mocks.publishTrack
      .mockRejectedValueOnce(new Error('publishing rejected as engine not connected within timeout'))
      .mockResolvedValue(undefined);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mocks.markJoinedMutateAsync).toHaveBeenCalled();
    // Track 1 rejects once then succeeds on retry (2 calls); track 2 succeeds first try (1 call).
    expect(mocks.publishTrack).toHaveBeenCalledTimes(3);
  });

  it('detaches a remote track that drops mid-debate instead of freezing the tile', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    const remoteVideo = document.createElement('video');
    const track = { kind: 'video', attach: () => remoteVideo, detach: vi.fn(() => [remoteVideo]) };

    act(() => emitRoomEvent('trackSubscribed', track));
    expect(document.body.contains(remoteVideo)).toBe(true);

    act(() => emitRoomEvent('trackUnsubscribed', track));
    expect(track.detach).toHaveBeenCalled();
    expect(document.body.contains(remoteVideo)).toBe(false);
  });

  it('surfaces a reconnecting state while LiveKit restarts a dropped call', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    act(() => emitRoomEvent('reconnecting'));
    expect(screen.getByText('Reconnecting to the debate room…')).toBeInTheDocument();

    act(() => emitRoomEvent('reconnected'));
    expect(screen.queryByText('Reconnecting to the debate room…')).not.toBeInTheDocument();
  });

  it('shows an error on an unexpected disconnect but ignores our own teardown', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    // CLIENT_INITIATED (our own disconnect) must not surface an error.
    act(() => emitRoomEvent('disconnected', 1));
    expect(screen.queryByText('Lost connection to the debate room.')).not.toBeInTheDocument();

    act(() => emitRoomEvent('disconnected', 99));
    expect(await screen.findByText('Lost connection to the debate room.')).toBeInTheDocument();
  });

  it('explains when LiveKit disconnects a duplicate participant identity', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    act(() => emitRoomEvent('disconnected', 2));

    expect(await screen.findByText('This debate is active in another tab or device.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue here' })).toBeInTheDocument();
    expect(screen.queryByText('Lost connection to the debate room.')).not.toBeInTheDocument();
    expect(mocks.ownershipRelease).toHaveBeenCalled();
  });

  it('does not resume an in-flight join after a duplicate-identity disconnect', async () => {
    const pendingJoin = deferred<void>();
    mocks.markJoinedMutateAsync.mockReturnValue(pendingJoin.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledOnce());

    act(() => emitRoomEvent('disconnected', 2));
    expect(await screen.findByText('This debate is active in another tab or device.')).toBeInTheDocument();

    pendingJoin.resolve();
    await waitFor(() => expect(mocks.roomDisconnect).toHaveBeenCalled());
    expect(mocks.publishTrack).not.toHaveBeenCalled();
    expect(screen.getByText('This debate is active in another tab or device.')).toBeInTheDocument();
  });

  it('connects to LiveKit after the Strict Mode effect rehearsal', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(
      <StrictMode>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </StrictMode>
    );

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
  });

  it('refetches the debate when LiveKit reports the remote participant connected', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    const participantConnected = mocks.roomOn.mock.calls.find(([event]) => event === 'participantConnected')?.[1];

    expect(participantConnected).toBeTypeOf('function');
    participantConnected();
    expect(mocks.refetchDebate).toHaveBeenCalled();
  });

  it('stops preview tracks that resolve after the page unmounts', async () => {
    const tracks = [
      { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ];
    const pendingTracks = deferred<typeof tracks>();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    view.unmount();
    pendingTracks.resolve(tracks);

    await waitFor(() => expect(tracks.every(track => track.stop.mock.calls.length === 1)).toBe(true));
  });

  it('disconnects a LiveKit room that connects after the page unmounts', async () => {
    const pendingConnection = deferred<void>();
    mocks.roomConnect.mockReturnValue(pendingConnection.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    view.unmount();
    pendingConnection.resolve();

    await waitFor(() => expect(mocks.roomDisconnect).toHaveBeenCalled());
    expect(mocks.markJoinedMutateAsync).not.toHaveBeenCalled();
  });

  it('shows the recording screen as stacked local and remote video tiles', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn camera off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable audio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeInTheDocument();
    expect(screen.queryByText(/has the floor/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    expect(
      document.querySelector('[data-inactive-speaker="remote"] [data-muted-indicator="true"]')
    ).toBeInTheDocument();
    expectDebateVideoTileInColor('local');
    expectDebateVideoTileInColor('remote');
  });

  it('keeps the remote speaking turn in color and orders yes above no when the local participant chose no', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      participants: completedDebate().participants.map(participant => ({
        ...participant,
        position: participant.user_id === 'user-a' ? false : true,
        position_label: participant.user_id === 'user-a' ? 'No' : 'Yes',
      })),
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const dialog = await screen.findByRole('dialog', { name: 'Debate recording' });
    const tiles = [...dialog.querySelectorAll('[data-debate-video-position]')];
    expect(tiles.map(tile => tile.getAttribute('data-debate-video-position'))).toEqual(['yes', 'no']);
    expect(tiles[0]?.querySelector('[data-inactive-speaker]')).toHaveAttribute('data-inactive-speaker', 'remote');
    expect(tiles[1]?.querySelector('[data-inactive-speaker]')).toHaveAttribute('data-inactive-speaker', 'local');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'true');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveClass('bg-black/45');
    expect(document.querySelector('[data-inactive-speaker="local"] [data-muted-indicator="true"]')).toBeInTheDocument();
    expectDebateVideoTileInColor('local');
    expectDebateVideoTileInColor('remote');
  });

  it('shows recording debug controls when debate debugging is enabled', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.featureFlags.debateDebugging = true;
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable audio' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Debate phases' })).toBeInTheDocument();
    expect(screen.getByText('Connecting').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Preflight').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Timed turn 1').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Timed turn 2').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Thanking').closest('li')).not.toHaveAttribute('aria-current');

    const remoteVideo = document.createElement('video');
    const trackSubscribed = mocks.roomOn.mock.calls.find(([event]) => event === 'trackSubscribed')?.[1];
    act(() => trackSubscribed?.({ attach: () => remoteVideo }));
    expect(remoteVideo.muted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Disable audio' }));

    await waitFor(() => expect(remoteVideo.muted).toBe(true));
    expectDebateVideoTileInColor('remote');
  });

  it('enables Krisp by default and records the processed microphone track', async () => {
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    installRecordingMocks();

    await renderLiveDebate();

    await waitFor(() => expect(audioTrack.setProcessor).toHaveBeenCalledOnce());
    expect(audioTrack.setProcessor.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.publishTrack.mock.invocationCallOrder[0]
    );
    expect(mocks.krispSetEnabled).toHaveBeenCalledWith(true);
    await waitFor(() => expect(mocks.mediaRecorderConstruct).toHaveBeenCalledOnce());
    const recordedStream = mocks.mediaRecorderConstruct.mock.calls[0]?.[0] as MediaStream;
    expect(recordedStream.getAudioTracks()[0]).toMatchObject({ id: 'krisp-processed-audio' });
    expect(screen.queryByRole('switch', { name: 'Krisp noise filter' })).not.toBeInTheDocument();
  });

  it('toggles Krisp from the debate debug controls without restarting the recorder', async () => {
    mocks.featureFlags.debateDebugging = true;
    installRecordingMocks();

    await renderLiveDebate();

    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'true'));
    expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce();

    fireEvent.click(noiseFilterSwitch);

    await waitFor(() => expect(mocks.krispSetEnabled).toHaveBeenLastCalledWith(false));
    expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'false');
    expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce();

    fireEvent.click(noiseFilterSwitch);

    await waitFor(() => expect(mocks.krispSetEnabled).toHaveBeenLastCalledWith(true));
    expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'true');
    expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce();
  });

  it('disables the Krisp switch while a toggle is pending', async () => {
    const disabling = deferred<void>();
    mocks.featureFlags.debateDebugging = true;

    await renderLiveDebate();

    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());
    mocks.krispSetEnabled.mockReturnValueOnce(disabling.promise);
    fireEvent.click(noiseFilterSwitch);

    expect(noiseFilterSwitch).toBeDisabled();
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    disabling.resolve();

    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());
    expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('marks Krisp unavailable when a live toggle fails', async () => {
    mocks.featureFlags.debateDebugging = true;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderLiveDebate();

    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());
    mocks.krispSetEnabled.mockRejectedValueOnce(new Error('Processor stopped'));
    fireEvent.click(noiseFilterSwitch);

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(noiseFilterSwitch).toBeDisabled();
    expect(warning).toHaveBeenCalledWith('[DebateNoiseFilter] Krisp could not change state.', expect.any(Error));
  });

  it('disables the Krisp switch while the recording is being saved', async () => {
    const persistence = deferred<void>();
    mocks.featureFlags.debateDebugging = true;
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    expect(noiseFilterSwitch).toBeDisabled();

    persistence.resolve();
  });

  it('keeps the debate connected with the browser microphone track when Krisp is unsupported', async () => {
    const audioTrack = createLocalAudioTrack();
    mocks.krispSupported.mockReturnValue(false);
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.featureFlags.debateDebugging = true;
    installRecordingMocks();

    await renderLiveDebate();

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Krisp noise filter' })).toBeDisabled();
    expect(audioTrack.setProcessor).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.mediaRecorderConstruct).toHaveBeenCalledOnce());
    const recordedStream = mocks.mediaRecorderConstruct.mock.calls[0]?.[0] as MediaStream;
    expect(recordedStream.getAudioTracks()[0]).toMatchObject({ id: 'browser-audio' });
    expect(screen.queryByText(/Could not join the debate room/)).not.toBeInTheDocument();
  });

  it('shows Krisp as loading and disables the debug switch while initialization is pending', async () => {
    const initialization = deferred<void>();
    mocks.featureFlags.debateDebugging = true;
    mocks.krispSetEnabled.mockReturnValue(initialization.promise);

    await renderLiveDebate();

    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    expect(noiseFilterSwitch).toBeDisabled();
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    initialization.resolve();

    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());
    expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'true');
  });

  it('falls back to the browser microphone track when Krisp initialization fails', async () => {
    const audioTrack = createLocalAudioTrack();
    audioTrack.setProcessor.mockRejectedValue(new Error('Model download failed'));
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.featureFlags.debateDebugging = true;
    installRecordingMocks();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderLiveDebate();

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Krisp noise filter' })).toBeDisabled();
    await waitFor(() => expect(mocks.mediaRecorderConstruct).toHaveBeenCalledOnce());
    const recordedStream = mocks.mediaRecorderConstruct.mock.calls[0]?.[0] as MediaStream;
    expect(recordedStream.getAudioTracks()[0]).toMatchObject({ id: 'browser-audio' });
    expect(screen.queryByText(/Could not join the debate room/)).not.toBeInTheDocument();
    expect(warning).toHaveBeenCalledWith(
      '[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.',
      expect.any(Error)
    );
  });

  it('reapplies the local Krisp preference after a manual connection retry', async () => {
    const disabling = deferred<void>();
    const firstAudioTrack = createLocalAudioTrack();
    const retriedAudioTrack = createLocalAudioTrack();
    mocks.krispSetEnabled.mockImplementation((enabled: boolean) =>
      enabled ? Promise.resolve(undefined) : disabling.promise
    );
    mocks.createLocalTracks
      .mockResolvedValueOnce([
        firstAudioTrack,
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ])
      .mockResolvedValueOnce([
        retriedAudioTrack,
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ]);
    mocks.featureFlags.debateDebugging = true;

    await renderLiveDebate();

    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(noiseFilterSwitch);
    await waitFor(() => expect(mocks.krispSetEnabled).toHaveBeenLastCalledWith(false));

    act(() => emitRoomEvent('disconnected', 99));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry connection' }));

    await waitFor(() => expect(retriedAudioTrack.setProcessor).toHaveBeenCalledOnce());
    disabling.resolve();
    await waitFor(() => expect(mocks.krispSetEnabled).toHaveBeenLastCalledWith(false));
    expect(mocks.krispSetEnabled.mock.calls.filter(([enabled]) => enabled === false)).toHaveLength(2);
    expect(await screen.findByRole('switch', { name: 'Krisp noise filter' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the circular phase timer during a timed debate turn', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:21.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByLabelText('Phase timer: 19 seconds remaining')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(document.querySelector('circle[stroke="var(--color-white)"]')).toBeInTheDocument();
  });

  it('shows the circular five-second timer during preflight', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:05.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      preflight_ends_at: '2026-07-02T00:00:10.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByLabelText('Phase timer: 5 seconds remaining')).toBeInTheDocument();
    expect(screen.getAllByText('5')).not.toHaveLength(0);
    expect(document.querySelector('circle[stroke="var(--color-red-01)"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    expectDebateVideoTileInColor('local');
    expectDebateVideoTileInColor('remote');
  });

  it('advances a synchronized countdown between debate refetches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2030-01-01T00:00:00.000Z'));
    mocks.getServerTime.mockResolvedValue({ server_time_ms: Date.parse('2026-07-02T00:00:05.000Z') });
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      preflight_ends_at: '2026-07-02T00:00:10.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Phase timer: 5 seconds remaining')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(screen.getByLabelText('Phase timer: 4 seconds remaining')).toBeInTheDocument();
  });

  it('uses synchronized server time when the device clock is skewed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2030-01-01T00:00:00.000Z'));
    mocks.getServerTime.mockResolvedValue({ server_time_ms: Date.parse('2026-07-02T00:00:05.000Z') });
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      preflight_ends_at: '2026-07-02T00:00:10.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByLabelText('Phase timer: 5 seconds remaining')).toBeInTheDocument();
  });

  it('waits for clock synchronization before arming recording timers', async () => {
    const pendingClock = deferred<{ server_time_ms: number }>();
    mocks.getServerTime.mockReturnValue(pendingClock.promise);
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2030-01-01T00:00:00.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
    expect(mocks.mediaRecorderStart).not.toHaveBeenCalled();
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();

    pendingClock.resolve({ server_time_ms: Date.parse('2026-07-02T00:00:20.000Z') });
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
  });

  it('shows connection state without exposing the connection deadline', async () => {
    mocks.debate = {
      ...completedDebate(),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      completed_at: null,
      participants: completedDebate().participants.map(participant => ({
        ...participant,
        joined_at: participant.user_id === 'user-a' ? participant.joined_at : null,
      })),
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Connecting')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phase timer/)).not.toBeInTheDocument();
    expect(screen.queryByText('00:10')).not.toBeInTheDocument();
  });

  it('stops media at the deadline and returns to matching after backend cancellation', async () => {
    vi.useFakeTimers();
    const connectingDebate: Debate = {
      ...completedDebate(),
      status: 'connecting',
      connecting_started_at: '2000-07-02T00:00:00.000Z',
      connecting_deadline_at: '2000-07-02T00:00:10.000Z',
      completed_at: null,
    };
    mocks.debate = connectingDebate;
    mocks.refetchDebate.mockResolvedValue({
      data: {
        ...connectingDebate,
        status: 'cancelled',
        cancellation_reason: 'connection_timeout',
      },
    });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Connection failed. Finding another match.')).toBeInTheDocument();
    expect(mocks.clearTimedOutDebateActivity).toHaveBeenCalledWith('debate-1');
    expect(mocks.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(750));
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/questions');
  });

  it('keeps the room connected when preflight won the deadline race', async () => {
    const connectingDebate: Debate = {
      ...completedDebate(),
      status: 'connecting',
      connecting_started_at: '2000-07-02T00:00:00.000Z',
      connecting_deadline_at: '2000-07-02T00:00:10.000Z',
      completed_at: null,
    };
    mocks.debate = connectingDebate;
    mocks.refetchDebate.mockResolvedValue({
      data: {
        ...connectingDebate,
        status: 'preflight',
        preflight_ends_at: '2000-07-02T00:00:15.000Z',
      },
    });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.refetchDebate).toHaveBeenCalled());
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
    expect(screen.queryByText('Connection failed. Finding another match.')).not.toBeInTheDocument();
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('stops published tracks when the backend confirms a connection timeout', async () => {
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    const videoTrack = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([audioTrack, videoTrack]);
    const connectingDebate: Debate = {
      ...completedDebate(),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      completed_at: null,
    };
    mocks.debate = connectingDebate;
    mocks.refetchDebate.mockResolvedValue({
      data: { ...connectingDebate, status: 'cancelled', cancellation_reason: 'connection_timeout' },
    });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    mocks.debate = { ...connectingDebate, connecting_deadline_at: '2000-07-02T00:00:10.000Z' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.clearTimedOutDebateActivity).toHaveBeenCalledWith('debate-1'));
    expect(mocks.roomDisconnect).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
  });

  it('does not show the thank-you hint before the thanking phase when the local slot is unknown', async () => {
    mocks.liveKitJoinMutateAsync.mockReturnValue(deferred<never>().promise);
    mocks.debate = {
      ...completedDebate(),
      status: 'connecting',
      current_turn_index: 0,
      current_speaker_slot: null,
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).not.toBeInTheDocument();
  });

  it('shows a large local countdown before the participant is up', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:29.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText("You're up in")).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(document.querySelector('circle[stroke="var(--color-red-01)"]')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
  });

  it('shows GO when the local participant turn begins', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:30.000Z',
      turn_started_at: '2026-07-02T00:00:30.000Z',
      turn_ends_at: '2026-07-02T00:01:00.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
  });

  it('shows wrap it up with a red ring on the active speaker in the final five seconds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:26.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Wrap it up!')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(screen.queryByText('GO!')).not.toBeInTheDocument();
    expect(document.querySelector('circle[stroke="var(--color-red-01)"]')).toBeInTheDocument();
  });

  it('labels the upcoming turn as a rebuttal in the final round', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:01:26.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 1,
      current_speaker_slot: 2,
      turn_durations_ms: [45_000, 45_000, 30_000, 30_000],
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:45.000Z',
      turn_ends_at: '2026-07-02T00:01:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Rebut in')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(screen.getAllByText('4')).toHaveLength(2);
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('circle[stroke="var(--color-red-01)"]')).toBeInTheDocument();
  });

  it('shows debate ends soon to the inactive speaker on the final turn', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:02:26.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 3,
      current_speaker_slot: 2,
      turn_durations_ms: [45_000, 45_000, 30_000, 30_000],
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:02:00.000Z',
      turn_ends_at: '2026-07-02T00:02:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate ends soon')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(screen.queryByText('Rebut in')).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('circle[stroke="var(--color-red-01)"]')).toBeInTheDocument();
  });

  it('advances directly from the warning to GO without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: false }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));

    mocks.debate = {
      ...mocks.debate,
      current_turn_index: 1,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:30.000Z',
      turn_ends_at: '2026-07-02T00:01:00.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByText('GO!')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);
  });

  it('advances from preflight to the first turn without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      first_participant_slot: 1,
      current_turn_index: 0,
      current_speaker_slot: null,
      started_at: null,
      preflight_ends_at: '2026-07-02T00:00:30.000Z',
      turn_started_at: null,
      turn_ends_at: null,
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
  });

  it('advances from the final turn to thanking without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.500Z'));
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: false }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 1,
      current_speaker_slot: 2,
      turn_durations_ms: [10_000, 10_000],
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:20.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
  });

  it('does not restart completion work when revisiting an already-completed debate', async () => {
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate complete.')).toBeInTheDocument();
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(screen.queryByText('Continue debating this claim?')).not.toBeInTheDocument();
  });

  it('shows rematch consent during thanking and records local consent', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate again?')).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === 'Nice debate!Say thanks')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Phase timer: 20 seconds remaining')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalled());
  });

  it('disables rematch consent and shows waiting immediately after clicking yes', async () => {
    const consent = deferred<DebateRematchSession>();
    mocks.consentMutateAsync.mockReturnValue(consent.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));

    expect(await screen.findByRole('button', { name: 'Waiting...' })).toBeDisabled();
  });

  it('does not leave the rematch flow when the local recording cannot be persisted', async () => {
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    expect(
      await screen.findByText('Could not save the local recording. Please try leaving again.')
    ).toBeInTheDocument();
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows the thank-you hint only during the local participant half', async () => {
    installRecordingMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:31.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      screen.queryByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).not.toBeInTheDocument();
  });

  it('waits for durable recording persistence before entering the rematch browser', async () => {
    const persistence = deferred<void>();
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.rematch = rematchSession('browsing');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalled());
    expect(mocks.enqueueRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        debateId: 'debate-1',
        blob: expect.any(Blob),
        mimeType: 'video/webm',
      })
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');

    persistence.resolve();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('persists the recording at the canonical debate deadline without waiting for thanking status', async () => {
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:01:10.001Z'));
    mocks.debate = { ...mocks.debate! };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    expect(mocks.debate.status).toBe('in_progress');
  });

  it('recognizes a durable queued recording after the debate room reloads', async () => {
    mocks.getRecording.mockResolvedValue({ id: 'user-a:debate-1' });
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('browsing');
    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.getRecording).toHaveBeenCalledWith('user-a:debate-1'));
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();

    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
  });

  it('waits for a deciding rematch session to resolve before finalizing the completed debate', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.rematch = rematchSession('deciding');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(screen.getByText('Debate complete.')).toBeInTheDocument());
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates');

    mocks.rematch = rematchSession('browsing');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalled());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('keeps the completion screen available when recording persistence fails', async () => {
    mocks.enqueueRecording.mockRejectedValue(new Error('Storage unavailable'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findAllByText('Storage unavailable')).not.toHaveLength(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('retains an in-memory recording after a quota failure and retries the same Blob', async () => {
    mocks.enqueueRecording.mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByText(
        'There is not enough browser storage to save this recording. Free some device storage, then retry.'
      )
    ).toBeInTheDocument();
    const firstBlob = mocks.enqueueRecording.mock.calls[0]?.[0].blob;
    mocks.enqueueRecording.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    expect(mocks.enqueueRecording.mock.calls[1]?.[0].blob).toBe(firstBlob);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates'));
  });

  it('tells the opponent their debate was removed when the other participant cancels the upload', async () => {
    mocks.debate = {
      ...completedDebate(),
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-b',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Your debate was removed')).toBeInTheDocument();
    expect(screen.getByText('Bri cancelled the upload of your debate')).toBeInTheDocument();
    // The local blob must be dropped so this tab never publishes the cancelled recording.
    await waitFor(() => expect(mocks.deleteRecording).toHaveBeenCalledWith('user-a:debate-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates');
  });
});

async function renderLiveDebate() {
  mocks.debate = {
    ...completedDebate(),
    status: 'in_progress',
    current_speaker_slot: 1,
    turn_started_at: '2026-07-02T00:00:10.000Z',
    turn_ends_at: '2026-07-02T00:00:40.000Z',
    completed_at: null,
  };
  const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
  await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
  return view;
}

function expectDebateVideoTileInColor(participant: 'local' | 'remote') {
  const tile = document.querySelector(`[data-inactive-speaker="${participant}"]`)?.closest('section');
  expect(tile).not.toBeNull();
  expect(tile).not.toHaveClass('grayscale');
}

function installRecordingMocks() {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
  vi.stubGlobal(
    'MediaRecorder',
    class extends EventTarget {
      static isTypeSupported() {
        return true;
      }

      state: RecordingState = 'inactive';
      mimeType = 'video/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;

      constructor(stream: MediaStream) {
        super();
        mocks.mediaRecorderConstruct(stream);
      }

      start() {
        this.state = 'recording';
        mocks.mediaRecorderStart();
        this.dispatchEvent(new Event('start'));
      }

      requestData() {
        this.ondataavailable?.({ data: new Blob(['recording']) } as BlobEvent);
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    }
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
}

function createLocalAudioTrack() {
  const browserTrack = { kind: 'audio', enabled: true, id: 'browser-audio' };
  let processor: { processedTrack?: { kind: string; enabled: boolean; id: string } } | null = null;

  return {
    get mediaStreamTrack() {
      return processor?.processedTrack ?? browserTrack;
    },
    setProcessor: vi.fn(async (nextProcessor: typeof processor) => {
      processor = nextProcessor;
    }),
    stopProcessor: vi.fn(async () => {
      processor = null;
    }),
    stop: vi.fn(),
    detach: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function completedDebate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'debate-claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'complete',
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: null,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'standard',
    turn_durations_ms: [30_000, 30_000],
    created_at: '2026-07-02T00:00:00.000Z',
    started_at: '2026-07-02T00:00:10.000Z',
    completed_at: '2026-07-02T00:01:10.000Z',
    participants: [
      {
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: '2026-07-02T00:00:00.000Z',
        ready_at: '2026-07-02T00:00:00.000Z',
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: '2026-07-02T00:00:00.000Z',
        ready_at: '2026-07-02T00:00:00.000Z',
      },
    ],
    recordings: [],
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}

function readyDebate({ localReady, remoteReady }: { localReady: boolean; remoteReady: boolean }): Debate {
  return {
    ...completedDebate(),
    status: 'ready',
    started_at: null,
    completed_at: null,
    participants: completedDebate().participants.map(participant => ({
      ...participant,
      joined_at: null,
      ready_at:
        participant.user_id === 'user-a'
          ? localReady
            ? '2026-07-02T00:00:00.000Z'
            : null
          : remoteReady
            ? '2026-07-02T00:00:00.000Z'
            : null,
    })),
  };
}

function rematchSession(status: DebateRematchSession['status']): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status,
    participants: [
      {
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: null,
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: null,
      },
    ],
    decision_expires_at: '2026-07-02T00:01:30.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-02T00:01:10.000Z',
    updated_at: '2026-07-02T00:01:10.000Z',
  };
}
