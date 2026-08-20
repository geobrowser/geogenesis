import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { type ComponentPropsWithoutRef, StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateRematchSession } from '~/core/debates/api';
import { recordDebateFlowOrigin } from '~/core/debates/debate-entry-intent';
import type { DebateRoomTakeoverContext } from '~/core/debates/debate-room-ownership';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { DebateRoomPageClient, isDebateInThankYouPeriod } from './debate-room-page-client';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  abortMutateAsync: vi.fn(),
  clearDebateActivity: vi.fn(),
  consentMutateAsync: vi.fn(),
  endTurnMutateAsync: vi.fn(),
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
  krispDestroy: vi.fn(),
  roomConnect: vi.fn(),
  roomConstruct: vi.fn(),
  roomDisconnect: vi.fn(),
  publishTrack: vi.fn(),
  supportsAudioOutputSelection: vi.fn(),
  selectAudioOutput: vi.fn(),
  setThankingDebate: vi.fn(),
  enumerateDevices: vi.fn(),
  getServerTime: vi.fn(),
  refetchDebate: vi.fn(),
  clearTimedOutDebateActivity: vi.fn(),
  roomOn: vi.fn(),
  capture: vi.fn(),
  ownershipAcquire: vi.fn(),
  ownershipRequestTakeover: vi.fn(),
  ownershipRelease: vi.fn(),
  ownershipClose: vi.fn(),
  ownershipTakeoverHandler: null as null | ((context: DebateRoomTakeoverContext) => boolean | Promise<boolean>),
  ownershipCoordinationMode: 'lock-and-broadcast' as 'lock-and-broadcast' | 'lock-only' | 'livekit-fallback',
  useRealRoomOwnership: false,
  deviceChangeHandler: null as null | (() => void),
  debate: null as Debate | null,
  rematch: null as DebateRematchSession | null,
  featureFlags: {
    debateDebugging: false,
  } as Record<string, boolean>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push, replace: mocks.replace }),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => mocks.featureFlags[id] ?? false,
}));

vi.mock('~/core/analytics', () => ({
  capture: mocks.capture,
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
  useAbortDebate: () => ({ mutateAsync: mocks.abortMutateAsync, isPending: false }),
  useClearDebateActivity: () => mocks.clearDebateActivity,
  useClearTimedOutDebateActivity: () => mocks.clearTimedOutDebateActivity,
  useConsentToDebateRematch: () => ({ mutateAsync: mocks.consentMutateAsync, isPending: false }),
  useEndDebateTurn: () => ({ mutateAsync: mocks.endTurnMutateAsync, isPending: false }),
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

vi.mock('~/core/debates/thanking-debate-store', () => ({
  useSetThankingDebate: () => mocks.setThankingDebate,
}));

vi.mock('~/core/debates/debate-room-ownership', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/debate-room-ownership')>();

  return {
    ...actual,
    createDebateRoomOwnershipCoordinator: (
      options: Parameters<typeof actual.createDebateRoomOwnershipCoordinator>[0]
    ) => {
      if (mocks.useRealRoomOwnership) return actual.createDebateRoomOwnershipCoordinator(options);
      mocks.ownershipTakeoverHandler = options.onTakeoverRequested;
      return {
        instanceId: 'connection-instance-1',
        coordinationMode: mocks.ownershipCoordinationMode,
        acquire: mocks.ownershipAcquire,
        requestTakeover: mocks.ownershipRequestTakeover,
        release: mocks.ownershipRelease,
        close: mocks.ownershipClose,
        ownsConnection: () => true,
      };
    },
  };
});

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  Room: class {
    constructor(options: unknown) {
      mocks.roomConstruct(options);
    }

    localParticipant = {
      publishTrack: mocks.publishTrack,
    };

    on = mocks.roomOn;
    connect = mocks.roomConnect;
    disconnect = mocks.roomDisconnect;
  },
  supportsAudioOutputSelection: mocks.supportsAudioOutputSelection,
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantConnected: 'participantConnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  // Mirrors the runtime shape of the protobuf numeric enum: forward name -> number entries plus
  // reverse number -> name entries, so disconnectReasonName's reverse-mapping filter is exercised.
  DisconnectReason: {
    CLIENT_INITIATED: 1,
    DUPLICATE_IDENTITY: 2,
    SERVER_SHUTDOWN: 3,
    1: 'CLIENT_INITIATED',
    2: 'DUPLICATE_IDENTITY',
    3: 'SERVER_SHUTDOWN',
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

type QueuedLock = {
  callback: (lock: Lock | null) => Promise<void> | void;
  resolve: () => void;
  reject: (error: unknown) => void;
};

class FakeLockManager {
  private held = false;
  private queue: QueuedLock[] = [];

  request(_name: string, options: LockOptions, callback: QueuedLock['callback']): Promise<void> {
    if (options.ifAvailable && this.held) return Promise.resolve(callback(null));

    return new Promise<void>((resolve, reject) => {
      const queued = { callback, resolve, reject };
      if (this.held) this.queue.push(queued);
      else void this.run(queued);
    });
  }

  private async run(queued: QueuedLock) {
    this.held = true;
    try {
      await queued.callback({ name: 'debate-room', mode: 'exclusive' });
      queued.resolve();
    } catch (error) {
      queued.reject(error);
    } finally {
      this.held = false;
      const next = this.queue.shift();
      if (next) void this.run(next);
    }
  }
}

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();

  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    FakeBroadcastChannel.channels.set(name, channels);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) queueMicrotask(() => channel.onmessage?.(new MessageEvent('message', { data })));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  setHistoryLength(1);
  window.sessionStorage.clear();
  mocks.back.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.abortMutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.clearDebateActivity.mockReset();
  mocks.consentMutateAsync.mockReset();
  mocks.endTurnMutateAsync.mockReset().mockResolvedValue(undefined);
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
  mocks.krispDestroy.mockReset().mockResolvedValue(undefined);
  mocks.roomConnect.mockReset();
  mocks.roomConstruct.mockReset();
  mocks.roomDisconnect.mockReset();
  mocks.publishTrack.mockReset();
  mocks.supportsAudioOutputSelection.mockReset().mockReturnValue(true);
  mocks.selectAudioOutput.mockReset().mockImplementation(({ deviceId }: { deviceId: string }) =>
    Promise.resolve({
      kind: 'audiooutput',
      deviceId,
      groupId: 'speaker-group',
      label: deviceId === 'speaker-2' ? 'Studio Speakers' : 'System default',
      toJSON: () => ({}),
    })
  );
  mocks.setThankingDebate.mockReset();
  mocks.enumerateDevices.mockReset().mockResolvedValue([
    { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
    { kind: 'audioinput', deviceId: 'mic-2', groupId: 'mic-group-2', label: 'Studio Mic' },
    { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
    { kind: 'audiooutput', deviceId: 'speaker-2', groupId: 'speaker-group-2', label: 'Studio Speakers' },
    { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    { kind: 'videoinput', deviceId: 'camera-2', groupId: 'camera-group-2', label: 'Desk Camera' },
  ]);
  mocks.getServerTime.mockReset();
  mocks.refetchDebate.mockReset();
  mocks.clearTimedOutDebateActivity.mockReset();
  mocks.roomOn.mockReset();
  mocks.capture.mockReset();
  // Tests run as an unfocused tab by default so the auto-takeover-on-focus effect stays quiet;
  // focused-tab scenarios opt in per test.
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  mocks.ownershipAcquire.mockReset().mockResolvedValue({ acquired: true, waitedForLocalRelease: false });
  mocks.ownershipRequestTakeover.mockReset().mockResolvedValue(true);
  mocks.ownershipRelease.mockReset();
  mocks.ownershipClose.mockReset();
  mocks.ownershipTakeoverHandler = null;
  mocks.ownershipCoordinationMode = 'lock-and-broadcast';
  mocks.useRealRoomOwnership = false;
  mocks.deviceChangeHandler = null;
  mocks.debate = completedDebate();
  mocks.rematch = null;
  mocks.featureFlags = {
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
    destroy: mocks.krispDestroy,
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
      enumerateDevices: mocks.enumerateDevices,
      selectAudioOutput: mocks.selectAudioOutput,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'devicechange') mocks.deviceChangeHandler = handler;
      }),
      removeEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'devicechange' && mocks.deviceChangeHandler === handler) mocks.deviceChangeHandler = null;
      }),
    },
  });
  setMobileLayout(false);
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  await Promise.resolve();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('isDebateInThankYouPeriod', () => {
  const deadline = Date.parse('2026-07-02T00:01:30.000Z');

  it('keeps an early-completed debate in thanking until its authoritative deadline', () => {
    expect(
      isDebateInThankYouPeriod(
        {
          status: 'complete',
          turn_ends_at: '2026-07-02T00:01:30.000Z',
          completed_at: '2026-07-02T00:01:10.000Z',
        },
        deadline - 1
      )
    ).toBe(true);
  });

  it('ends thanking exactly at the authoritative deadline', () => {
    expect(
      isDebateInThankYouPeriod(
        {
          status: 'thanking',
          turn_ends_at: '2026-07-02T00:01:30.000Z',
          completed_at: null,
        },
        deadline
      )
    ).toBe(false);
  });
});

describe('DebateRoomPageClient', () => {
  it('returns through browser history without rendering an already-completed room', async () => {
    setHistoryLength(2);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1'));
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
  });

  // GEO-2605. history.length says only how deep we are, not where the flow began: hub -> room ->
  // rematch -> room leaves another room one entry back, so back() returns into the flow. The path
  // recorded on entry is the only thing that knows where the viewer actually came from.
  it('returns to the path the flow started from rather than one history entry back', async () => {
    setHistoryLength(4);
    recordDebateFlowOrigin('/space/space-1/entity-7');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/entity-7'));
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('falls back to the debates page when a cancelled room has no prior history', async () => {
    setHistoryLength(1);
    mocks.debate = { ...completedDebate(), status: 'cancelled', completed_at: null };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate cancelled.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1'));
    expect(mocks.back).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates');
  });

  // Forward, never back: the entry behind this room is often this same room (hub → room → rematch
  // → room), and stepping back into a debate that ended under us re-runs the exit from a fresh
  // mount. That was the flicker, and on the opponent's side it took a second Okay to escape.
  it('sends a recording canceller forward to the debates page instead of back into the room', async () => {
    setHistoryLength(2);
    mocks.debate = {
      ...completedDebate(),
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates'));
    expect(mocks.back).not.toHaveBeenCalled();
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
  });

  // The session is what keeps both sides "in a flow": it disables every Debate control and keeps
  // DebateCoordinator routing back into the room the cancellation just emptied.
  it('leaves the rematch the cancelled recording anchored', async () => {
    setHistoryLength(2);
    mocks.rematch = rematchSession('deciding');
    mocks.leaveRematchMutateAsync.mockResolvedValue(rematchSession('ended'));
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
  });

  it('leaves the rematch on the opponent side too, and never blocks their exit on it', async () => {
    setHistoryLength(2);
    mocks.rematch = rematchSession('deciding');
    mocks.leaveRematchMutateAsync.mockRejectedValue(new Error('rematch already gone'));
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-b',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Your debate was removed')).toBeInTheDocument();
    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));

    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates');
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('shows the pre-screen while the debate is waiting for readiness', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.getByText('Debate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: "I'm ready" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio settings' }).parentElement).toHaveClass('gap-[6px]');
    expect(screen.getByText('Speak to test your mic')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
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

  it('blocks readiness while the combined camera and microphone request is pending', async () => {
    const pendingTracks =
      deferred<
        Array<ReturnType<typeof createLocalAudioTrack> | { mediaStreamTrack: { kind: string }; stop: () => void }>
      >();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: true,
        video: true,
      })
    );
    expect(screen.getByText('Requesting access to your camera and microphone…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready" })).not.toBeInTheDocument();

    pendingTracks.resolve([createLocalAudioTrack(), { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);

    expect(await screen.findByRole('button', { name: "I'm ready" })).toBeEnabled();
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

  it('lets participants choose microphone and camera devices from desktop settings menus', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const audioTrigger = await screen.findByRole('button', { name: 'Audio settings' });
    expect(audioTrigger).toHaveAttribute('data-state', 'closed');
    fireEvent.click(audioTrigger);
    const audioSettings = screen.getByRole('dialog', { name: 'Audio settings' });
    expect(audioSettings).toHaveAttribute('data-side', 'top');
    expect(audioSettings.closest('[data-radix-popper-content-wrapper]')?.parentElement).toHaveClass('elevated-popover');
    expect(audioTrigger).toHaveAttribute('data-state', 'open');
    expect(audioTrigger).toHaveAttribute('aria-controls', audioSettings.id);
    expect(screen.getByText('Select a microphone')).toBeInTheDocument();
    expect(screen.getByText('Select a speaker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));

    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-1' },
      });
    });
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Video settings' }));
    expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Video settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Desk Camera' }));

    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-2' },
      });
    });
  });

  it('shows the designed permission recovery state and retries access', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied by system policy'), { name: 'NotAllowedError' })
    );

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Allow access to your camera and microphone to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Audio settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }));

    expect(await screen.findByRole('button', { name: "I'm ready" })).toBeEnabled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2);
  });

  it('keeps readiness blocked when either required input is unavailable', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValueOnce([createLocalAudioTrack()]);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Connect a camera and microphone, then try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready" })).not.toBeInTheDocument();
  });

  it('cleans up acquired tracks when device enumeration fails', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    const videoTrack = {
      mediaStreamTrack: { kind: 'video', enabled: true },
      stop: vi.fn(),
      detach: vi.fn(),
    };
    mocks.createLocalTracks.mockResolvedValueOnce([audioTrack, videoTrack]);
    mocks.enumerateDevices.mockRejectedValueOnce(new Error('Device enumeration failed'));

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByText('We could not start your camera and microphone. Check your devices and try again.')
    ).toBeInTheDocument();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: "I'm ready" })).not.toBeInTheDocument();
  });

  it('changes speaker output without restarting capture and hands the selection to LiveKit', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const selectedOutput = deferred<MediaDeviceInfo>();
    mocks.selectAudioOutput.mockReturnValueOnce(selectedOutput.promise);

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));
    await waitFor(() => expect(mocks.selectAudioOutput).toHaveBeenCalledWith({ deviceId: 'speaker-2' }));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);

    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalled());
    expect(mocks.roomConstruct).not.toHaveBeenCalled();

    act(() =>
      selectedOutput.resolve({
        kind: 'audiooutput',
        deviceId: 'speaker-2',
        groupId: 'speaker-group-2',
        label: 'Studio Speakers',
        toJSON: () => ({}),
      })
    );

    await waitFor(() =>
      expect(mocks.roomConstruct).toHaveBeenCalledWith({
        adaptiveStream: false,
        dynacast: false,
        reconnectPolicy: expect.any(ExtendedReconnectPolicy),
        disconnectOnPageLeave: false,
        publishDefaults: {
          simulcast: true,
          videoEncoding: { maxBitrate: 800_000, maxFramerate: 25 },
          degradationPreference: 'maintain-framerate',
          videoCodec: 'vp8',
          red: true,
          dtx: true,
        },
        audioOutput: { deviceId: 'speaker-2' },
      })
    );
  });

  it('falls back to a non-editable System default when speaker routing is unsupported', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.supportsAudioOutputSelection.mockReturnValue(false);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));

    expect(screen.getByRole('radio', { name: 'System default' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: 'Studio Speakers' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeEnabled();
  });

  it('falls back to System default when speaker authorization is rejected', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.selectAudioOutput.mockRejectedValueOnce(Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' }));

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled());
    expect(screen.getByRole('radio', { name: 'System default' })).toBeChecked();
    expect(screen.getByText('This browser could not route audio to that speaker. Using System default.')).toBeVisible();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: 'Studio Speakers' })).not.toBeInTheDocument();
  });

  it('ignores an older speaker authorization that finishes after the latest choice', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
      { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
      { kind: 'audiooutput', deviceId: 'speaker-2', groupId: 'speaker-group-2', label: 'Studio Speakers' },
      { kind: 'audiooutput', deviceId: 'speaker-3', groupId: 'speaker-group-3', label: 'Display Speakers' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    ]);
    const olderSelection = deferred<MediaDeviceInfo>();
    const latestSelection = deferred<MediaDeviceInfo>();
    mocks.selectAudioOutput.mockImplementation(({ deviceId }: { deviceId: string }) =>
      deviceId === 'speaker-2' ? olderSelection.promise : latestSelection.promise
    );

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Display Speakers' }));

    act(() =>
      latestSelection.resolve({
        kind: 'audiooutput',
        deviceId: 'speaker-3',
        groupId: 'speaker-group-3',
        label: 'Display Speakers',
        toJSON: () => ({}),
      })
    );
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Display Speakers' })).toBeChecked());

    act(() => olderSelection.reject(Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' })));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Display Speakers' })).toBeChecked());
    expect(screen.queryByText(/could not route audio/i)).not.toBeInTheDocument();
  });

  it('closes desktop settings with Escape and returns focus to the trigger', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await screen.findByRole('button', { name: 'Audio settings' });
    trigger.focus();
    fireEvent.click(trigger);
    const settings = screen.getByRole('dialog', { name: 'Audio settings' });

    fireEvent.keyDown(settings, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes desktop settings on outside click and returns focus to the trigger', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await screen.findByRole('button', { name: 'Audio settings' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();
    await act(() => new Promise(resolve => window.setTimeout(resolve, 0)));

    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('toggles desktop settings closed from the active trigger', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await screen.findByRole('button', { name: 'Audio settings' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
  });

  it('supports keyboard device selection without closing the desktop menu', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Video settings' }));
    const selectedCamera = screen.getByRole('radio', { name: 'HD Pro Webcam' });
    selectedCamera.focus();

    fireEvent.keyDown(selectedCamera, { key: 'ArrowDown' });

    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-1' },
        video: { deviceId: 'camera-2' },
      })
    );
    expect(screen.getByRole('dialog', { name: 'Video settings' })).toBeInTheDocument();
  });

  it('keeps the desktop menu open while a selected input is restarting', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));
    const pendingTracks =
      deferred<
        Array<ReturnType<typeof createLocalAudioTrack> | { mediaStreamTrack: { kind: string }; stop: () => void }>
      >();
    mocks.createLocalTracks.mockReturnValueOnce(pendingTracks.promise);

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));

    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeDisabled();

    pendingTracks.resolve([createLocalAudioTrack(), { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Studio Mic' })).toBeChecked());
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeEnabled();
  });

  it('opens mobile video settings as a bottom sheet using the existing preview stream', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Video settings' }));

    expect(screen.getByRole('dialog', { name: 'Video settings' })).toHaveAttribute('data-layout', 'bottom-sheet');
    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    expect(videos[0]?.srcObject).toBe(videos[1]?.srcObject);
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('opens mobile audio settings with microphone and speaker groups', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    expect(await screen.findByText('Speak to test your mic')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio settings' }).parentElement).toHaveClass('gap-[6px]');
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));

    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toHaveAttribute('data-layout', 'bottom-sheet');
    expect(screen.getByText('Select a microphone')).toBeInTheDocument();
    expect(screen.getByText('Select a speaker')).toBeInTheDocument();
  });

  it('returns focus to the mobile settings trigger after closing the sheet', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await screen.findByRole('button', { name: 'Audio settings' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toHaveAttribute('data-layout', 'bottom-sheet');

    fireEvent.click(screen.getByRole('button', { name: 'Close Audio settings' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('preserves valid device selections and restarts capture when a selected device is removed', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audio settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));
    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-1' },
      })
    );
    const callCountWithValidSelection = mocks.createLocalTracks.mock.calls.length;

    act(() => mocks.deviceChangeHandler?.());
    await waitFor(() => expect(mocks.enumerateDevices).toHaveBeenCalled());
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(callCountWithValidSelection);

    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
      { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
      { kind: 'videoinput', deviceId: 'camera-2', groupId: 'camera-group-2', label: 'Desk Camera' },
    ]);
    act(() => mocks.deviceChangeHandler?.());

    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-1' },
        video: { deviceId: 'camera-1' },
      })
    );
  });

  it('ignores stale device enumeration results during rapid hardware changes', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await screen.findByRole('button', { name: "I'm ready" });
    const olderEnumeration = deferred<MediaDeviceInfo[]>();
    mocks.enumerateDevices.mockReturnValueOnce(olderEnumeration.promise).mockResolvedValueOnce([
      { kind: 'audioinput', deviceId: 'mic-2', groupId: 'mic-group-2', label: 'Studio Mic' },
      { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    ]);

    act(() => mocks.deviceChangeHandler?.());
    act(() => mocks.deviceChangeHandler?.());

    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-1' },
      })
    );

    act(() =>
      olderEnumeration.resolve([
        { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
        { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
        { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
      ] as MediaDeviceInfo[])
    );

    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Studio Mic' })).toBeChecked());
  });

  it('shows the opponent as ready while the local participant can still become ready', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: true });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: "I'm ready" })).toBeEnabled();
  });

  it('disables the ready button while waiting for the opponent', async () => {
    mocks.debate = readyDebate({ localReady: true, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: 'Waiting...' })).toBeDisabled();
    expect(screen.getAllByText('Waiting...')).toHaveLength(2);
  });

  it('marks the local participant ready from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: "I'm ready" }));

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

  it('marks the participant joined before a cold local-track request finishes', async () => {
    const pendingTracks = deferred<Awaited<ReturnType<typeof mocks.createLocalTracks>>>();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.createLocalTracks).toHaveBeenCalledOnce();
    expect(mocks.publishTrack).not.toHaveBeenCalled();
  });

  it('keeps a retry reachable when local media fails after the debate has advanced past connecting', async () => {
    const pendingTracks = deferred<Awaited<ReturnType<typeof mocks.createLocalTracks>>>();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledOnce());

    // The server counts us as joined, so it will start the debate rather than time the pair out and
    // rematch them. Getting media is still outstanding when that happens.
    mocks.debate = {
      ...mocks.debate,
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 2,
      turn_started_at: '2099-07-02T00:00:30.000Z',
      turn_ends_at: '2099-07-02T00:01:00.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    pendingTracks.reject(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        'debate_room_connection_failed',
        expect.objectContaining({ stage: 'local_tracks', error_name: 'NotReadableError' })
      )
    );
    // Nothing on the server side can rescue this participant now, so the way back in has to survive
    // the status change that removed the connecting-deadline rematch.
    expect(await screen.findByRole('button', { name: 'Retry connection' })).toBeEnabled();
  });

  it('re-runs connect once by itself when local media fails while the debate is still connecting', async () => {
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // The server counted the join, so the connecting-deadline rematch can no longer rescue us and
    // the room has to try again on its own — the auto-connect effect will not, since the debate is
    // still `connecting` and the room never returns to idle.
    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalled());
    expect(mocks.markJoinedMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('stops after the one silent re-attempt when local media keeps failing', async () => {
    mocks.createLocalTracks.mockRejectedValue(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(2), { timeout: 3000 });
    // A repeating camera error would otherwise spin; the second failure leaves it to the viewer.
    expect(await screen.findByRole('button', { name: 'Retry connection' })).toBeEnabled();
    await new Promise(resolve => setTimeout(resolve, 1200));
    expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('does not turn a later lost connection into an automatic reconnect after a post-join recovery', async () => {
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalled(), { timeout: 3000 });
    expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(2);

    // Recovery must not leave the auto-connect latch open: a network drop stops at "Lost connection"
    // with a Retry button, as it always did, rather than reconnecting behind the viewer's back.
    act(() => emitRoomEvent('disconnected', 99));
    expect(await screen.findByText('Lost connection to the debate room.')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('enables the microphone from the turn that is live when local media finally arrives', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    const audioTrack = createLocalAudioTrack();
    const pendingTracks = deferred<Awaited<ReturnType<typeof mocks.createLocalTracks>>>();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    // The remote slot holds the turn as `connect` is built, so the closure it captures says the
    // local microphone should stay off.
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 2,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.publishTrack).not.toHaveBeenCalled();

    // The turn passes to the local slot while `createLocalTracks` is still cold. The reconciliation
    // effect fires here against an empty track list, so it has nothing to act on.
    mocks.debate = {
      ...mocks.debate,
      current_turn_index: 1,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:15.000Z',
      turn_ends_at: '2026-07-02T00:00:45.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    pendingTracks.resolve([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    // Guards the end state only. The underlying race — `connect` writing a captured, now-stale
    // countdown over tracks that landed after the turn changed — needs the same `connect`
    // invocation to survive the advance, and this harness starts a fresh one instead. That the
    // microphone is live for the current turn after a cold media start is still worth pinning.
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledTimes(2));
    const publishedAudioTrack = mocks.publishTrack.mock.calls
      .map(([track]) => track)
      .find(track => track?.sourceMediaStreamTrack?.kind === 'audio');
    expect(publishedAudioTrack).toBeDefined();
    expect(publishedAudioTrack.sourceMediaStreamTrack.enabled).toBe(true);
  });

  it('reports the exact connection stage when LiveKit signaling fails', async () => {
    mocks.roomConnect.mockRejectedValue(new Error('signaling failed'));
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        'debate_room_connection_failed',
        expect.objectContaining({
          debate_id: 'debate-1',
          stage: 'livekit_connect',
          error_name: 'Error',
          error_message: 'signaling failed',
        })
      )
    );
    expect(mocks.markJoinedMutateAsync).not.toHaveBeenCalled();
  });

  it('does not mint a token when another tab owns the participant connection', async () => {
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
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
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_connection_conflict',
      expect.objectContaining({
        debate_id: 'debate-1',
        source: 'web_lock_blocked',
        coordination_mode: 'lock-and-broadcast',
        debate_status: 'connecting',
        room_state: 'idle',
        visibility_state: expect.any(String),
        has_focus: expect.any(Boolean),
        navigation_type: expect.any(String),
      })
    );
  });

  it('keeps lock-only pages exclusive before token creation', async () => {
    mocks.useRealRoomOwnership = true;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: new FakeLockManager() });
    vi.stubGlobal('BroadcastChannel', undefined);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(
      <>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </>
    );

    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce());
    expect(await screen.findByText('This debate is already open in another tab.')).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_connection_conflict',
      expect.objectContaining({ source: 'web_lock_blocked', coordination_mode: 'lock-only' })
    );
  });

  it('uses the LiveKit fallback instead of showing a conflict when Web Lock requests fail', async () => {
    mocks.useRealRoomOwnership = true;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn().mockRejectedValue(new Error('Web Locks are unavailable')),
      },
    });
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    expect(screen.queryByText('This debate is already open in another tab.')).not.toBeInTheDocument();
    expect(mocks.capture).not.toHaveBeenCalledWith(
      'debate_room_connection_conflict',
      expect.objectContaining({ source: 'web_lock_blocked' })
    );
  });

  it('takes over a connection-phase debate before minting a new token', async () => {
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
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

  it('automatically reclaims the debate when the blocked tab is the focused one', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // No "Continue here" click: the lock race landed the room in another tab while the user is
    // looking at this one, so the focused tab issues the takeover itself.
    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce());
  });

  it('does not auto-reclaim across devices after a duplicate-identity disconnect', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    act(() => emitRoomEvent('disconnected', 2));

    // The other participant identity may be the user's phone; evicting it must stay behind the
    // explicit "Continue here" click even though this tab is focused.
    expect(await screen.findByText('This debate is active in another tab or device.')).toBeInTheDocument();
    expect(mocks.ownershipRequestTakeover).not.toHaveBeenCalled();
  });

  it('does not retry a refused auto-takeover until the tab genuinely loses and regains focus', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.ownershipRequestTakeover.mockResolvedValue(false);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 50));

    // A refusal must not spin: the next attempt waits for a real focus transition.
    expect(mocks.ownershipRequestTakeover).toHaveBeenCalledOnce();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();

    // Redundant focus/visibilitychange events while the tab never lost focus must not retry —
    // browsers fire both for a single activation, and a double connect() supersedes itself.
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.ownershipRequestTakeover).toHaveBeenCalledOnce();

    // A genuine blur re-arms the attempt; regaining focus retries exactly once even though the
    // activation fires both events.
    hasFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledTimes(2));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.ownershipRequestTakeover).toHaveBeenCalledTimes(2);
  });

  it('does not auto-takeover once the debate is in progress', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // Past preflight the room is (or should be) recording, so the focused duplicate stays on the
    // dead-end screen rather than pulling a live debate out from under the owner.
    expect(
      await screen.findByRole('heading', { name: 'This debate is already open in another tab.' })
    ).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.ownershipRequestTakeover).not.toHaveBeenCalled();
  });

  it('keeps takeover available during a preflight ownership conflict', async () => {
    const now = Date.parse('2026-07-02T00:00:05.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      preflight_ends_at: new Date(now + 5_000).toISOString(),
      completed_at: null,
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

    await expect(
      Promise.resolve(mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2 }))
    ).resolves.toBe(true);
    expect(mocks.roomDisconnect).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_connection_conflict',
      expect.objectContaining({ source: 'ownership_released', coordination_mode: 'lock-and-broadcast' })
    );

    pendingConnection.resolve();
  });

  it('does not allow a secondary tab to take over an active debate recording', async () => {
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByRole('heading', { name: 'This debate is already open in another tab.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Close this tab and continue your debate in the original tab.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to debates' })).toHaveAttribute('href', '/space/space-1/debates');
    expect(screen.queryByRole('button', { name: 'Continue here' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to debates' })).not.toBeInTheDocument();
    expect(screen.queryByText('Debate room')).not.toBeInTheDocument();
    expect(screen.queryByText('in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for both speakers to join.')).not.toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
    expect(mocks.roomConnect).not.toHaveBeenCalled();
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
    await expect(
      Promise.resolve(mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2 }))
    ).resolves.toBe(false);
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

  it('reports a reconnect episode once, with its duration, and joins with resilient connect options', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
    expect(mocks.roomConnect).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      maxRetries: 3,
      websocketTimeout: 20_000,
      peerConnectionTimeout: 25_000,
    });

    act(() => emitRoomEvent('reconnecting'));
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_reconnecting',
      expect.objectContaining({ debate_id: 'debate-1' })
    );

    // LiveKit emits Reconnecting once per underlying attempt; a second attempt must not restart
    // the episode clock or double-report.
    act(() => emitRoomEvent('reconnecting'));
    expect(mocks.capture.mock.calls.filter(([eventName]) => eventName === 'debate_room_reconnecting')).toHaveLength(1);

    act(() => emitRoomEvent('reconnected'));
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_reconnected',
      expect.objectContaining({ debate_id: 'debate-1', elapsed_ms: expect.any(Number) })
    );
  });

  it('reports the disconnect reason and retry duration when auto-reconnect gives up', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    act(() => emitRoomEvent('reconnecting'));
    act(() => emitRoomEvent('disconnected', 3));
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_disconnected',
      expect.objectContaining({
        debate_id: 'debate-1',
        disconnect_reason: 'SERVER_SHUTDOWN',
        elapsed_ms: expect.any(Number),
      })
    );
  });

  it('stays silent when our own teardown disconnects the room', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    // A takeover release nulls roomRef and bumps the connection generation before the SDK can
    // emit Disconnected, so the CLIENT_INITIATED from our own room.disconnect() never reaches the
    // handler body — no "Lost connection" error, no drop metric.
    await act(async () => {
      await mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2 });
    });
    mocks.capture.mockClear();
    act(() => emitRoomEvent('disconnected', 1));

    expect(screen.queryByText('Lost connection to the debate room.')).not.toBeInTheDocument();
    expect(mocks.capture).not.toHaveBeenCalledWith('debate_room_disconnected', expect.anything());
  });

  it('treats a frozen-tab CLIENT_INITIATED disconnect on a live room as a genuine drop', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    // The SDK's `freeze` listener is not gated by disconnectOnPageLeave, so Chromium freezing a
    // backgrounded tab disconnects the live room with CLIENT_INITIATED. Our own teardowns never
    // reach the handler (they null roomRef or bump the generation first), so this must surface as
    // a drop rather than leaving a dead room behind a "connected" UI.
    act(() => emitRoomEvent('disconnected', 1));
    expect(await screen.findByText('Lost connection to the debate room.')).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_disconnected',
      expect.objectContaining({ disconnect_reason: 'CLIENT_INITIATED' })
    );
  });

  it('explains when LiveKit disconnects a duplicate participant identity', async () => {
    mocks.ownershipCoordinationMode = 'livekit-fallback';
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
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_connection_conflict',
      expect.objectContaining({ source: 'livekit_duplicate_identity', coordination_mode: 'livekit-fallback' })
    );
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
    mocks.useRealRoomOwnership = true;
    FakeBroadcastChannel.channels.clear();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: new FakeLockManager() });
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
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

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledOnce());
    expect(screen.queryByText('This debate is already open in another tab.')).not.toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_room_ownership_recovered',
      expect.objectContaining({
        debate_id: 'debate-1',
        coordination_mode: 'lock-and-broadcast',
        waited_for_local_release: true,
      })
    );
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
    await waitFor(() => expect(mocks.roomOn.mock.calls.some(([event]) => event === 'trackSubscribed')).toBe(true));
    const remoteVideo = document.createElement('video');
    const trackSubscribed = mocks.roomOn.mock.calls.find(([event]) => event === 'trackSubscribed')?.[1];
    act(() => trackSubscribed?.({ attach: () => remoteVideo }));

    const heading = screen.getByRole('heading', { name: 'The protocol should ship debates' });
    expect(heading).toBeInTheDocument();
    expect(heading.closest('main')).toHaveClass('max-w-[430px]');
    expect(heading).toHaveClass('mb-5', 'max-w-[390px]', 'text-[1.375rem]', 'leading-[1.1]');
    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn camera off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable audio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeInTheDocument();
    expect(screen.queryByText(/has the floor/i)).not.toBeInTheDocument();
    expectActiveDebateVideoTile('local');
    expectInactiveDebateVideoTile('remote');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveClass('opacity-0');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveClass('top-3', 'right-3', 'opacity-100');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).not.toHaveClass(
      'inset-0',
      'bg-[#151515]/75',
      'opacity-60'
    );
    expectMutedIndicator('remote');
    expectNoMutedIndicator('local');
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
    expectActiveDebateVideoTile('remote');
    expectInactiveDebateVideoTile('local');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'true');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveClass('top-3', 'right-3', 'opacity-100');
    expect(document.querySelector('[data-inactive-speaker="local"]')).not.toHaveClass(
      'inset-0',
      'bg-[#151515]/75',
      'opacity-60'
    );
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveClass('opacity-0');
    expectMutedIndicator('local');
    expectNoMutedIndicator('remote');
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

  it('keeps the Krisp source and processed tracks aligned with turn-based microphone state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    const audioTrack = createLocalAudioTrack();
    const processedTrack = { kind: 'audio', enabled: true, id: 'krisp-processed-audio' };
    mocks.krispNoiseFilter.mockReturnValue({
      processedTrack,
      setEnabled: mocks.krispSetEnabled,
      isEnabled: mocks.krispIsEnabled,
      destroy: mocks.krispDestroy,
    });
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    const view = await renderLiveDebate({
      first_participant_slot: 2,
      current_speaker_slot: 2,
    });

    await waitFor(() => expect(audioTrack.setProcessor).toHaveBeenCalledOnce());
    expect(audioTrack.sourceMediaStreamTrack.enabled).toBe(false);
    expect(processedTrack.enabled).toBe(false);

    mocks.debate = {
      ...mocks.debate!,
      started_at: '2026-07-01T23:59:40.000Z',
      current_turn_index: 1,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(audioTrack.sourceMediaStreamTrack.enabled).toBe(true));
    expect(processedTrack.enabled).toBe(true);
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

  it('hides debate controls while the terminal recording is being saved', async () => {
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
    expect(noiseFilterSwitch).not.toBeInTheDocument();

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
    expect(mocks.krispDestroy).toHaveBeenCalledOnce();
    expect(audioTrack.stopProcessor).not.toHaveBeenCalled();
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

  it('does not let an old toggle clear a newer processor toggle after reconnecting', async () => {
    const oldDisabling = deferred<void>();
    const newEnabling = deferred<void>();
    const firstAudioTrack = createLocalAudioTrack();
    const retriedAudioTrack = createLocalAudioTrack();
    const oldSetEnabled = vi.fn((enabled: boolean) => (enabled ? Promise.resolve(undefined) : oldDisabling.promise));
    const newSetEnabled = vi.fn((enabled: boolean) => (enabled ? newEnabling.promise : Promise.resolve(undefined)));
    mocks.krispNoiseFilter
      .mockReturnValueOnce({
        processedTrack: { kind: 'audio', enabled: true, id: 'old-krisp-audio' },
        setEnabled: oldSetEnabled,
        isEnabled: mocks.krispIsEnabled,
        destroy: mocks.krispDestroy,
      })
      .mockReturnValueOnce({
        processedTrack: { kind: 'audio', enabled: true, id: 'new-krisp-audio' },
        setEnabled: newSetEnabled,
        isEnabled: mocks.krispIsEnabled,
        destroy: mocks.krispDestroy,
      });
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

    const firstSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(firstSwitch).toBeEnabled());
    fireEvent.click(firstSwitch);
    await waitFor(() => expect(oldSetEnabled).toHaveBeenLastCalledWith(false));

    act(() => emitRoomEvent('disconnected', 99));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry connection' }));

    const retriedSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(retriedSwitch).toBeEnabled());
    expect(retriedSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(retriedSwitch);
    expect(retriedSwitch).toBeDisabled();

    oldDisabling.resolve();

    await waitFor(() => expect(oldSetEnabled).toHaveResolved());
    expect(retriedSwitch).toBeDisabled();

    newEnabling.resolve();

    await waitFor(() => expect(retriedSwitch).toBeEnabled());
    expect(retriedSwitch).toHaveAttribute('aria-checked', 'true');
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

    const phaseTimer = await screen.findByLabelText('Phase timer: 19 seconds remaining');
    expect(debateVideoTile('local')).toContainElement(phaseTimer);
    expectActiveDebateVideoTile('local');
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(phaseTimer).toHaveStyle({ width: '51px', height: '51px' });
    expect(phaseTimer.querySelector('svg')).toHaveAttribute('viewBox', '0 0 51 51');
    expect(phaseTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FFFFFF');
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

    const phaseTimer = await screen.findByLabelText('Phase timer: 5 seconds remaining');
    expect(phaseTimer).toBeInTheDocument();
    expect(screen.getAllByText('5')).not.toHaveLength(0);
    expect(phaseTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FFFFFF');
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
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
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
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
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
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
    expect(document.querySelector('[data-countdown-progress][stroke="#FF4A26"]')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('local');
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

  it('ends the active local turn optimistically and mutes the microphone', async () => {
    const endedAtMs = Date.parse('2026-07-02T00:00:20.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(endedAtMs);
    const pendingEnd = deferred<Debate>();
    mocks.endTurnMutateAsync.mockReturnValue(pendingEnd.promise);
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const endTurn = await screen.findByRole('button', { name: 'End turn' });
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
    fireEvent.click(endTurn);

    expect(mocks.endTurnMutateAsync).toHaveBeenCalledWith({ turnIndex: 0, endedAtMs: expect.any(Number) });
    expect(mocks.endTurnMutateAsync.mock.calls[0]?.[0].endedAtMs).toBeGreaterThanOrEqual(endedAtMs);
    expect(endTurn).toBeDisabled();
    expect(screen.getByText('Ending turn…')).toBeInTheDocument();
    expect(debateVideoTile('local').querySelector('[aria-label^="Phase timer:"]')).not.toBeInTheDocument();
    expectMutedIndicator('local');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
  });

  it('keeps a slow end-turn request pending until the server supplies the handoff deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));

    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(screen.getByText('Ending turn…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End turn' })).toBeDisabled();
  });

  it('reconciles a committed turn yield after the mutation response is lost', async () => {
    const endedAt = '2026-07-02T00:00:20.000Z';
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(endedAt));
    mocks.endTurnMutateAsync.mockRejectedValue(new Error('Connection lost'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };
    mocks.refetchDebate.mockResolvedValue({
      data: {
        ...mocks.debate,
        turn_yields: [
          {
            turn_index: 0,
            user_id: 'user-a',
            participant_slot: 1,
            yielded_at: endedAt,
            accepted_at: endedAt,
            handoff_deadline_at: '2026-07-02T00:00:25.000Z',
          },
        ],
      },
    });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));

    await waitFor(() => expect(mocks.refetchDebate).toHaveBeenCalled());
    expect(screen.queryByText('Connection lost')).not.toBeInTheDocument();
  });

  it('reconstructs a yielded handoff and counts the incoming local speaker in', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:24.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:25.000Z',
      completed_at: null,
      turn_yields: [
        {
          turn_index: 0,
          user_id: 'user-b',
          participant_slot: 2,
          yielded_at: '2026-07-02T00:00:20.000Z',
          accepted_at: '2026-07-02T00:00:20.000Z',
          handoff_deadline_at: '2026-07-02T00:00:25.000Z',
        },
      ],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const ending = await screen.findByText('Ending turn…');
    expect(debateVideoTile('remote')).toContainElement(ending);
    expect(debateVideoTile('local')).toContainElement(screen.getByText('Your turn in'));
    const yieldedTimer = screen.getByLabelText('Phase timer: 10 seconds remaining');
    expect(yieldedTimer).toHaveAttribute('data-timer-progress', String(2 / 3));
    expect(yieldedTimer).toHaveAttribute('data-muted-timer', 'true');
    expect(yieldedTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', 'rgba(190,190,190,0.92)');
    expect(screen.queryByRole('button', { name: 'End turn' })).not.toBeInTheDocument();
  });

  it('preserves the normal incoming count-in when a turn is yielded inside its final five seconds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:29.000Z'));
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
      turn_yields: [
        {
          turn_index: 0,
          user_id: 'user-b',
          participant_slot: 2,
          yielded_at: '2026-07-02T00:00:26.000Z',
          accepted_at: '2026-07-02T00:00:26.000Z',
          handoff_deadline_at: '2026-07-02T00:00:30.000Z',
        },
      ],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText("You're up in")).toBeInTheDocument();
    expect(screen.queryByText('Your turn in')).not.toBeInTheDocument();
    const yieldedTimer = screen.getByLabelText('Phase timer: 4 seconds remaining');
    expect(yieldedTimer).toHaveAttribute('data-muted-timer', 'true');
    expect(yieldedTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', 'rgba(190,190,190,0.92)');
  });

  it('moves a yielded final turn into the normal thank-you phase as soon as the server snapshot arrives', async () => {
    const endedAt = '2026-07-02T00:00:50.000Z';
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(endedAt));
    mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 1,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:30.000Z',
      turn_ends_at: '2026-07-02T00:01:00.000Z',
      completed_at: null,
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));
    expect(screen.getByText('Ending turn…')).toBeInTheDocument();

    mocks.debate = {
      ...mocks.debate,
      status: 'thanking',
      current_speaker_slot: null,
      turn_started_at: endedAt,
      turn_ends_at: '2026-07-02T00:01:10.000Z',
      rematch_session_id: 'rematch-1',
      turn_yields: [
        {
          turn_index: 1,
          user_id: 'user-a',
          participant_slot: 1,
          yielded_at: endedAt,
          accepted_at: endedAt,
          handoff_deadline_at: endedAt,
        },
      ],
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate again?')).toBeInTheDocument();
    expect(screen.queryByText('Ending turn…')).not.toBeInTheDocument();
  });

  it('shows wrap it up only on the active local speaker during the penultimate turn', async () => {
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

    const wrapItUp = await screen.findByText('Wrap it up!');
    expect(debateVideoTile('local')).toContainElement(wrapItUp);
    expect(debateVideoTile('remote')).not.toContainElement(wrapItUp);
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(screen.queryByText('GO!')).not.toBeInTheDocument();
    expect(document.querySelector('[data-countdown-progress][stroke="#FF4A26"]')).toBeInTheDocument();
  });

  it('places the warning timer on the remote speaker without showing local wrap-up copy', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:26.500Z'));
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

    const phaseTimer = await screen.findByLabelText('Phase timer: 4 seconds remaining');
    expect(debateVideoTile('remote')).toContainElement(phaseTimer);
    expect(debateVideoTile('local')).not.toContainElement(phaseTimer);
    expectActiveDebateVideoTile('remote');
    expect(phaseTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FF4A26');
    expect(screen.queryByText('Wrap it up!')).not.toBeInTheDocument();
  });

  it('does not show wrap it up before the final five seconds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:24.000Z'));
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

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.queryByText('Wrap it up!')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Phase timer: 6 seconds remaining').querySelector('[data-countdown-progress]')
    ).toHaveAttribute('stroke', '#FFFFFF');
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
    expect(document.querySelector('[data-countdown-progress][stroke="#FF4A26"]')).toBeInTheDocument();
  });

  it('shows only debate ends soon to the inactive local participant on the final turn', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:02:26.500Z'));
    let clockElapsedMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clockElapsedMs);
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

    const debateEndsSoon = await screen.findByText('Debate ends soon');
    expect(screen.queryByText('Wrap it up!')).not.toBeInTheDocument();
    expect(debateVideoTile('local')).toContainElement(debateEndsSoon);
    expect(debateVideoTile('remote')).not.toContainElement(debateEndsSoon);
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(screen.queryByText('Rebut in')).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('local');
    expect(document.querySelector('[data-countdown-progress][stroke="#FF4A26"]')).toBeInTheDocument();

    clockElapsedMs = 4_000;

    await waitFor(() => {
      expect(screen.queryByText('Wrap it up!')).not.toBeInTheDocument();
      expect(screen.queryByText('Debate ends soon')).not.toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === 'Nice debate!Say thanks')).toBeInTheDocument();
    });
  });

  it('shows wrap it up to the active local participant on the final turn', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:02:26.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 3,
      current_speaker_slot: 1,
      turn_durations_ms: [45_000, 45_000, 30_000, 30_000],
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:02:00.000Z',
      turn_ends_at: '2026-07-02T00:02:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const wrapItUp = await screen.findByText('Wrap it up!');
    expect(debateVideoTile('local')).toContainElement(wrapItUp);
    expect(debateVideoTile('remote')).not.toContainElement(wrapItUp);
    expect(screen.queryByText('Debate ends soon')).not.toBeInTheDocument();
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
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('remote');
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
    expect(screen.getByText('Debate again?')).toBeInTheDocument();
    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
  });

  it('renders thanking on the scheduled final-turn boundary instead of the display interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-07-02T00:00:20.000Z'));
    const now = Date.now();
    const finalTurnEndsAt = now + 100;
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 1,
      current_speaker_slot: 2,
      turn_durations_ms: [10_000, 10_000],
      started_at: new Date(finalTurnEndsAt - 20_000).toISOString(),
      turn_started_at: new Date(finalTurnEndsAt - 10_000).toISOString(),
      turn_ends_at: new Date(finalTurnEndsAt).toISOString(),
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate again?')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(101));
    expect(screen.getByText('Debate again?')).toBeInTheDocument();
    expect(mocks.refetchDebate).not.toHaveBeenCalled();
  });

  it('clears an early-completed thank-you snapshot on its authoritative deadline', async () => {
    const now = Date.now();
    mocks.debate = {
      ...completedDebate(),
      status: 'complete',
      turn_started_at: new Date(now - 19_900).toISOString(),
      turn_ends_at: new Date(now + 100).toISOString(),
      completed_at: new Date(now - 5_000).toISOString(),
      rematch_session_id: 'rematch-1',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() =>
      expect(mocks.setThankingDebate).toHaveBeenCalledWith(expect.objectContaining({ debateId: 'debate-1' }))
    );
    await waitFor(() => expect(mocks.setThankingDebate).toHaveBeenLastCalledWith(null), { timeout: 350 });
    expect(mocks.refetchDebate).not.toHaveBeenCalled();
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
    const phaseTimers = screen.getAllByLabelText('Phase timer: 20 seconds remaining');
    expect(phaseTimers).toHaveLength(2);
    for (const phaseTimer of phaseTimers) {
      expect(phaseTimer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FFFFFF');
    }
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

  it('returns to the previous page after leaving during the thank-you phase', async () => {
    setHistoryLength(2);
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

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();
    expect(mocks.enqueueRecording.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.leaveRematchMutateAsync.mock.invocationCallOrder[0]!
    );
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
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
    expect(screen.getByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving local recording' })).toBeDisabled();
  });

  it('waits for durable recording persistence before returning to the previous page', async () => {
    const persistence = deferred<void>();
    setHistoryLength(2);
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
    expect(mocks.back).not.toHaveBeenCalled();

    persistence.resolve();
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('does not render a cancelled room while cleaning up an active debate', async () => {
    setHistoryLength(2);
    const view = await renderLiveDebate();

    mocks.debate = { ...completedDebate(), status: 'cancelled', completed_at: null };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate cancelled.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
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

  it('enters the rematch browser when the room reloads onto an already completed debate', async () => {
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = rematchSession('browsing');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
  });

  it('enters the converted rematch debate when the room reloads onto a completed debate', async () => {
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = { ...rematchSession('converted'), converted_debate_id: 'debate-2' };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/debate-2'));
    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
  });

  it('enters the rematch browser after the live connection drops before the debate completes', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate({ rematch_session_id: 'rematch-1' });
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    act(() => emitRoomEvent('disconnected', 99));
    expect(await screen.findByText('Lost connection to the debate room.')).toBeInTheDocument();

    mocks.rematch = rematchSession('browsing');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('keeps the completed debate visible while its rematch session is still deciding', async () => {
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = rematchSession('deciding');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate complete.')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
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

  it('returns to the previous page after leaving an active debate', async () => {
    setHistoryLength(2);
    const view = await renderLiveDebate();

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.abortMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
    view.unmount();
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
    setHistoryLength(2);
    mocks.debate = {
      ...completedDebate(),
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-b',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Your debate was removed')).toBeInTheDocument();
    expect(screen.getByText('Bri cancelled the upload of your debate')).toBeInTheDocument();
    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    // The local blob must be dropped so this tab never publishes the cancelled recording.
    await waitFor(() => expect(mocks.deleteRecording).toHaveBeenCalledWith('user-a:debate-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));
    // One acknowledgement, one exit, and never backwards into the room that just emptied.
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/space/space-1/debates');
    expect(mocks.back).not.toHaveBeenCalled();
  });
});

async function renderLiveDebate(overrides: Partial<Debate> = {}) {
  mocks.debate = {
    ...completedDebate(),
    status: 'in_progress',
    current_speaker_slot: 1,
    turn_started_at: '2026-07-02T00:00:10.000Z',
    turn_ends_at: '2026-07-02T00:00:40.000Z',
    completed_at: null,
    ...overrides,
  };
  const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
  await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
  return view;
}

function expectDebateVideoTileInColor(participant: 'local' | 'remote') {
  expect(debateVideoTile(participant)).not.toHaveClass('grayscale');
}

function expectActiveDebateVideoTile(participant: 'local' | 'remote') {
  expect(debateVideoTile(participant)).toHaveAttribute('data-active-speaker', 'true');
  expect(debateVideoTile(participant)).toHaveClass('outline-[3px]', 'outline-offset-0', 'outline-purple');
}

function expectInactiveDebateVideoTile(participant: 'local' | 'remote') {
  const tile = debateVideoTile(participant);
  expect(tile).toHaveAttribute('data-active-speaker', 'false');
  expect(tile).not.toHaveClass('outline-[3px]');
  expect(tile).not.toHaveClass('outline-offset-0');
  expect(tile).not.toHaveClass('outline-purple');
}

function expectMutedIndicator(participant: 'local' | 'remote') {
  const indicator = document.querySelector(`[data-inactive-speaker="${participant}"] [data-muted-indicator="true"]`);
  expect(indicator).toBeInTheDocument();
  expect(indicator).toHaveAttribute('aria-hidden', 'true');
  expect(indicator).toHaveAttribute('width', '51');
  expect(indicator).toHaveAttribute('height', '51');
  expect(indicator).toHaveAttribute('viewBox', '0 0 51 51');
  expect(indicator).toHaveClass('size-[51px]');

  const paths = indicator?.querySelectorAll('path');
  const background = paths?.[0];
  const gradient = indicator?.querySelector('linearGradient');
  expect(background).toHaveAttribute(
    'd',
    'M0 25.5C0 11.4167 11.4167 0 25.5 0C39.5833 0 51 11.4167 51 25.5C51 39.5833 39.5833 51 25.5 51C11.4167 51 0 39.5833 0 25.5Z'
  );
  expect(background).toHaveAttribute('fill', `url(#${gradient?.id})`);
  expect(background).toHaveAttribute('fill-opacity', '0.5');
  expect(gradient).toHaveAttribute('x1', '25.5');
  expect(gradient).toHaveAttribute('y1', '0');
  expect(gradient).toHaveAttribute('x2', '25.5');
  expect(gradient).toHaveAttribute('y2', '51');
  expect(gradient).toHaveAttribute('gradientUnits', 'userSpaceOnUse');
  const stops = gradient?.querySelectorAll('stop');
  expect(stops?.[0]).not.toHaveAttribute('offset');
  expect(stops?.[1]).toHaveAttribute('offset', '1');
  expect(stops?.[1]).toHaveAttribute('stop-opacity', '0.5');
  expect(indicator?.querySelectorAll('[stroke="white"]')).toHaveLength(3);
  expect(paths?.[1]).toHaveAttribute(
    'd',
    'M19.5 26L19.5 27C19.5 30.3137 22.1863 33 25.5 33C28.8137 33 31.5 30.3137 31.5 27V26'
  );
  expect(paths?.[1]).toHaveAttribute('stroke-linecap', 'round');
  expect(paths?.[2]).toHaveAttribute('d', 'M28.5 19.5L22.5 29');
}

function expectNoMutedIndicator(participant: 'local' | 'remote') {
  expect(
    document.querySelector(`[data-inactive-speaker="${participant}"] [data-muted-indicator="true"]`)
  ).not.toBeInTheDocument();
}

function debateVideoTile(participant: 'local' | 'remote') {
  const tile = document.querySelector(`[data-inactive-speaker="${participant}"]`)?.closest('section');
  if (!(tile instanceof HTMLElement)) throw new Error(`Missing ${participant} debate video tile`);
  return tile;
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
    sourceMediaStreamTrack: browserTrack,
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    response_kind: null,
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

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, 'length', { configurable: true, value: length });
}
