import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';
import { type ComponentPropsWithoutRef, StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Debate, type DebateRematchSession, GeoChatRequestError } from '~/core/debates/api';
import {
  clearDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '~/core/debates/debate-return-navigation';
import type { DebateRoomTakeoverContext } from '~/core/debates/debate-room-ownership';
import {
  carryLobbyJoinChoice,
  clearCarriedLobbyChoice,
  forgetLobbyDevices,
  registerLobbyCapture,
  reportLobbyCamera,
  reportLobbyMic,
} from '~/core/debates/lobbies/step-out';
import { DebateMediaSessionProvider, debateMediaSessionKey, useDebateMediaSession } from '~/core/debates/media-session';
import {
  CAP_ROUND_ENDS_AT as OPEN_ROUNDS_CAP_ROUND_ENDS_AT,
  at as openRoundsAt,
  capRoundLastTurn as openRoundsCapRoundLastTurn,
  deciding as openRoundsDeciding,
  listening as openRoundsListening,
  requiredRoundListening as openRoundsRequiredRoundListening,
  revealEnd as openRoundsRevealEnd,
  revealRebut as openRoundsRevealRebut,
  roundOneSpeaking as openRoundsRoundOneSpeaking,
  thankingAfterEnd as openRoundsThankingAfterEnd,
  timedOut as openRoundsTimedOut,
} from '~/core/debates/open-rounds-fixtures';
import { clearRematchJoinIntents, rememberRematchJoinIntent } from '~/core/debates/rematch-join-intent';
import { DebateRequestMediaPreview } from '~/core/debates/request-media-preview';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';
import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { DebateRoomPageClient, upcomingTurnLabel } from './debate-room-page-client';

const mocks = vi.hoisted(() => ({
  startVoiceCallTelemetry: vi.fn(),
  stopVoiceCallTelemetry: vi.fn(),
  currentUserId: 'user-a',
  localSpeaking: { current: false },
  prefetchAllowlist: vi.fn(),
  warmRelatedClaims: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routePrefetch: vi.fn(),
  prefetchRematchClaims: vi.fn(),
  abortMutateAsync: vi.fn(),
  clearDebateActivity: vi.fn(),
  consentMutateAsync: vi.fn(),
  endTurnMutateAsync: vi.fn(),
  savePickMutateAsync: vi.fn(),
  leaveRematchMutateAsync: vi.fn(),
  enqueueRecording: vi.fn(),
  startLiveStream: vi.fn(),
  liveStreamAppend: vi.fn(),
  liveStreamFinish: vi.fn(),
  liveStreamRelease: vi.fn(),
  liveStreamAbort: vi.fn(),
  liveStreamDetach: vi.fn(),
  getRecording: vi.fn(),
  deleteRecording: vi.fn(),
  requestPersistentStorage: vi.fn(),
  estimateStorage: vi.fn(),
  mediaRecorderStart: vi.fn(),
  recordingInputCreated: vi.fn(),
  recordingInputReady: null as Promise<void> | null,
  recordingInputUpdate: vi.fn(),
  recordingInputStop: vi.fn(),
  mediaRecorderConstruct: vi.fn(),
  readyMutateAsync: vi.fn(),
  capturingMutateAsync: vi.fn().mockResolvedValue(undefined),
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
  roomSwitchActiveDevice: vi.fn(),
  roomOff: vi.fn(),
  roomStartAudio: vi.fn(() => Promise.resolve()),
  roomCanPlaybackAudio: true,
  roomRemoteParticipants: new Map<string, unknown>(),
  roomLocalParticipant: { publishTrack: (...args: unknown[]) => mocks.publishTrack(...args) },
  roomDisconnect: vi.fn(),
  publishTrack: vi.fn(),
  supportsAudioOutputSelection: vi.fn(),
  selectAudioOutput: vi.fn(),
  setThankingDebate: vi.fn(),
  publishOptOutOffer: { debateId: null as string | null, busy: false, cancelled: false },
  setPublishOptOutRequest: vi.fn(),
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
  debateLoading: false,
  rematch: null as DebateRematchSession | null,
  featureFlags: {
    debateDebugging: false,
  } as Record<string, boolean>,
}));

vi.mock('~/core/debates/recording-input', () => ({
  createRecordingInput: (stream: MediaStream) => {
    mocks.recordingInputCreated();
    return {
      stream,
      ready: mocks.recordingInputReady ?? Promise.resolve(),
      update: mocks.recordingInputUpdate,
      stop: mocks.recordingInputStop,
    };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push, replace: mocks.replace, prefetch: mocks.routePrefetch }),
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

vi.mock('~/core/debates/use-local-speech-activity', () => ({
  useLocalSpeechActivity: () => mocks.localSpeaking,
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();

  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId,
    getServerTime: mocks.getServerTime,
  };
});

// The server-first return lives in lobby-return's own tests; here this tab's record decides.
vi.mock('~/core/debates/lobbies/lobby-return', async importOriginal => {
  const { consumeDebateReturnDestination, peekDebateReturnDestination } =
    await import('~/core/debates/debate-return-navigation');
  const { useCarriedLobbyChoice } = await importOriginal<typeof import('~/core/debates/lobbies/lobby-return')>();
  return {
    useCarriedLobbyChoice,
    useDebateReturnNavigation: () => ({
      consume: consumeDebateReturnDestination,
      returnsToLobby: Boolean(peekDebateReturnDestination()?.startsWith('/debate/')),
    }),
  };
});

vi.mock('~/core/debates/hooks', () => ({
  useAbortDebate: () => ({ mutateAsync: mocks.abortMutateAsync, isPending: false }),
  useClearDebateActivity: () => mocks.clearDebateActivity,
  useClearTimedOutDebateActivity: () => mocks.clearTimedOutDebateActivity,
  useConsentToDebateRematch: () => ({ mutateAsync: mocks.consentMutateAsync, isPending: false }),
  useEndDebateTurn: () => ({ mutateAsync: mocks.endTurnMutateAsync, isPending: false }),
  useDebate: () => ({
    data: mocks.debate,
    isLoading: mocks.debateLoading,
    error: null,
    refetch: mocks.refetchDebate,
  }),
  useDebateRematch: () => ({ data: mocks.rematch, isLoading: false, error: null }),
  useDebateRematchClaims: (sessionId: string, claimIds: string[], enabled: boolean) => {
    mocks.prefetchRematchClaims(sessionId, claimIds, enabled);
    return { data: undefined, isLoading: enabled, error: null };
  },
  useForgetEndedRematch: () => () => undefined,
  useLeaveDebateRematch: () => ({ mutateAsync: mocks.leaveRematchMutateAsync, isPending: false }),
  useLiveKitJoin: () => ({ mutateAsync: mocks.liveKitJoinMutateAsync, isPending: false }),
  useMarkDebateJoined: () => ({ mutateAsync: mocks.markJoinedMutateAsync, isPending: false }),
  useMarkDebateReady: () => ({ mutateAsync: mocks.readyMutateAsync, isPending: false }),
  useMarkDebateCapturing: () => ({ mutateAsync: mocks.capturingMutateAsync, isPending: false }),
  useSaveOpenRoundPick: () => ({ mutateAsync: mocks.savePickMutateAsync, isPending: false }),
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'account-a',
    getPrivyIdentityToken: async () => 'identity-token',
  }),
}));

vi.mock('~/core/debates/recording-stream', () => ({
  putRecordingPart: vi.fn(),
  startLiveRecordingStream: (options: { id: string }) => {
    mocks.startLiveStream(options);
    // The stream is where a streamed recording's bytes live, so it hands them back at the end.
    const chunks: Blob[] = [];
    const size = () => chunks.reduce((total, chunk) => total + chunk.size, 0);
    return {
      id: options.id,
      append: (chunk: Blob, chunkAtMs: number) => {
        chunks.push(chunk);
        mocks.liveStreamAppend(chunk, chunkAtMs);
      },
      size,
      recording: () => ({
        size: size(),
        availableFrom: 0,
        heldInMemory: true,
        read: async (start: number, end: number) => new Blob(chunks).slice(start, end),
      }),
      finish: mocks.liveStreamFinish,
      release: mocks.liveStreamRelease,
      abort: mocks.liveStreamAbort,
      detach: mocks.liveStreamDetach,
    };
  },
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
  // The publish control the thank-you card draws comes from the upload coordinator, which is a
  // sibling of this page rather than part of it. `publishOptOutOffer` is what it would be saying.
  usePublishOptOutOffer: () => mocks.publishOptOutOffer,
  useSetPublishOptOutRequest: () => mocks.setPublishOptOutRequest,
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

// No factory: the page imports the SDK twice at once, which a factory mock leaks (`__mocks__/livekit-client.ts`).
vi.mock('livekit-client');
vi.mock('~/core/debates/use-voice-call-telemetry', () => ({ startVoiceCallTelemetry: mocks.startVoiceCallTelemetry }));
vi.hoisted(() => {
  (globalThis as { __liveKitClientMock?: unknown }).__liveKitClientMock = {
    createLocalTracks: mocks.createLocalTracks,
    supportsAudioOutputSelection: mocks.supportsAudioOutputSelection,
    Room: class {
      constructor(options: unknown) {
        mocks.roomConstruct(options);
      }

      localParticipant = mocks.roomLocalParticipant;

      on = mocks.roomOn;
      off = mocks.roomOff;
      startAudio = mocks.roomStartAudio;
      get canPlaybackAudio() {
        return mocks.roomCanPlaybackAudio;
      }
      connect = mocks.roomConnect;
      disconnect = mocks.roomDisconnect;
      switchActiveDevice = mocks.roomSwitchActiveDevice;
      remoteParticipants = mocks.roomRemoteParticipants;
    },
  };
});

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: mocks.krispSupported,
  KrispNoiseFilter: mocks.krispNoiseFilter,
}));

let lobbyCaptureCleanup = () => {};

function emitRoomEvent(event: string, ...payload: unknown[]) {
  for (const [registeredEvent, callback] of mocks.roomOn.mock.calls) {
    if (registeredEvent === event) callback(...payload);
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

// The warm-up reaches for a QueryClient and this suite renders without a provider. Mocked to the
// question the room is responsible for: does entering a debate ask for the allowlist to be warmed?
vi.mock('~/core/debates/use-prefetch-claim-space-allowlist', () => ({
  usePrefetchClaimSpaceAllowlist: (enabled: boolean) => mocks.prefetchAllowlist(enabled),
}));

// The same arrangement, for the same reason: the room warms this one too and reads nothing back, so
// the only question here is whether it asks — with the claim being argued, and only once the debate
// is actually under way. Its real implementation wants a sync engine this suite does not stand up.
vi.mock('~/core/debates/use-related-debate-claims', () => ({
  useRelatedDebateClaims: (options: unknown) => {
    mocks.warmRelatedClaims(options);
    return { claimIds: [], spaceId: null, enabled: false, isLoading: false, error: null };
  },
}));

beforeEach(() => {
  mocks.currentUserId = 'user-a';
  mocks.localSpeaking = { current: false };
  clearRematchJoinIntents();
  mocks.publishOptOutOffer = { debateId: null, busy: false, cancelled: false };
  mocks.setPublishOptOutRequest.mockReset();
  mocks.prefetchAllowlist.mockReset();
  mocks.warmRelatedClaims.mockReset();
  clearDebateReturnDestination();
  setHistoryLength(1);
  mocks.back.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.routePrefetch.mockReset();
  mocks.prefetchRematchClaims.mockReset();
  mocks.abortMutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.clearDebateActivity.mockReset();
  mocks.consentMutateAsync.mockReset();
  mocks.endTurnMutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.leaveRematchMutateAsync.mockReset();
  mocks.enqueueRecording.mockReset();
  mocks.startLiveStream.mockReset();
  mocks.liveStreamAppend.mockReset();
  mocks.liveStreamFinish.mockReset().mockResolvedValue(null);
  mocks.liveStreamRelease.mockReset().mockResolvedValue(undefined);
  mocks.liveStreamAbort.mockReset().mockResolvedValue(undefined);
  mocks.liveStreamDetach.mockReset().mockResolvedValue(undefined);
  mocks.getRecording.mockReset();
  mocks.deleteRecording.mockReset().mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockReset();
  mocks.estimateStorage.mockReset();
  mocks.mediaRecorderStart.mockReset();
  mocks.capturingMutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.recordingInputCreated.mockReset();
  mocks.recordingInputReady = null;
  mocks.recordingInputUpdate.mockReset().mockResolvedValue(undefined);
  mocks.recordingInputStop.mockReset();
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
  mocks.stopVoiceCallTelemetry.mockReset();
  mocks.startVoiceCallTelemetry.mockReset().mockReturnValue(mocks.stopVoiceCallTelemetry);
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
  mocks.roomOff.mockReset();
  mocks.roomStartAudio.mockReset().mockResolvedValue(undefined);
  mocks.roomCanPlaybackAudio = true;
  mocks.roomSwitchActiveDevice.mockReset();
  mocks.roomSwitchActiveDevice.mockResolvedValue(true);
  mocks.roomRemoteParticipants = new Map();
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
  mocks.debateLoading = false;
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

/**
 * jsdom reports every document as visible, which since GEO-3149 is enough for a blocked tab to try
 * reclaiming the room on its own. Tests about the tab that has no automatic rescue hide it.
 */
function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(async () => {
  cleanup();
  // Drops the own property, restoring jsdom's prototype getter.
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
  window.localStorage.clear();
  clearDebateReturnDestination();
  clearCarriedLobbyChoice();
  lobbyCaptureCleanup();
  await Promise.resolve();
  await Promise.resolve();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('upcomingTurnLabel', () => {
  // Only the fields the label reads. The room renders this string verbatim into the count-in
  // overlay, and the rebuttal branch is covered end to end by the DOM test further down; this
  // covers the branch a two-round format cannot reach.
  const countdownAt = (turnIndex: number) =>
    ({ effectiveStatus: 'in_progress', turnIndex }) as Parameters<typeof upcomingTurnLabel>[1];
  const debateWith = (turnDurationsMs: number[]) =>
    ({ turn_durations_ms: turnDurationsMs }) as Parameters<typeof upcomingTurnLabel>[0];

  const threeRounds = debateWith([60_000, 60_000, 45_000, 45_000, 30_000, 30_000]);

  it('names the closing argument when counting into the third round', () => {
    expect(upcomingTurnLabel(threeRounds, countdownAt(3))).toBe('Closing argument in');
    expect(upcomingTurnLabel(threeRounds, countdownAt(4))).toBe('Closing argument in');
  });

  it('still names the rebuttal, which is now the middle round', () => {
    expect(upcomingTurnLabel(threeRounds, countdownAt(1))).toBe('Rebut in');
  });

  it('leaves the opening round and the final turn to the generic label', () => {
    expect(upcomingTurnLabel(threeRounds, countdownAt(0))).toBeNull();
    // Nothing comes after the last turn, so there is no turn to count into.
    expect(upcomingTurnLabel(threeRounds, countdownAt(5))).toBeNull();
  });

  it('reads a debate recorded before the closing round as two rounds', () => {
    const twoRounds = debateWith([60_000, 60_000, 45_000, 45_000]);

    expect(upcomingTurnLabel(twoRounds, countdownAt(1))).toBe('Rebut in');
    expect(upcomingTurnLabel(twoRounds, countdownAt(0))).toBeNull();
  });
});

/**
 * Open a device settings menu once the intro connection can no longer close it.
 *
 * The intro screen opens its own LiveKit connection, and `devicesLocked` — `ready_at`, or
 * `roomState` being 'connecting'/'reconnecting' — force-closes any open settings menu
 * (`debate-pre-join-screen.tsx`, "an open popover or sheet keeps its radios clickable"). That
 * behaviour is deliberate and has its own test. The problem is the race around it: a menu opened
 * while the intro connection is still in flight gets shut underneath the test, and every query for
 * a device radio then fails with `Unable to find role="radio"`.
 *
 * It reproduces at about one run in six under CPU contention, and deterministically by holding
 * `roomConnect` pending across the interaction — which is why it surfaced on CI, on this branch
 * and on master alike, while passing every time on an idle machine. An earlier attempt read it as
 * a re-render between two clicks and switched to `findByRole`; waiting longer cannot help, because
 * the menu is closed and stays closed.
 *
 * So wait for the connection to have been attempted *and* for the trigger to be enabled, which is
 * exactly `devicesLocked === false`.
 */
/** As {@link openDeviceSettings}, but focused first — for the tests that assert focus return. */
async function openDeviceSettingsFocused(name: 'Audio settings' | 'Video settings') {
  await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
  const trigger = await screen.findByRole('button', { name });
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

async function openDeviceSettings(name: 'Audio settings' | 'Video settings') {
  await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
  const trigger = await screen.findByRole('button', { name });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  return trigger;
}

describe('DebateRoomPageClient', () => {
  // GEO-2599. The debate-again picker's All tab waits on the claim-space allowlist, which walks the
  // Root space's topic tree — about thirteen sequential round trips cold, and the tab stays empty
  // until it lands. Entering the room says the picker is minutes away, so the traversal is started
  // against a viewer who is watching a debate rather than one waiting on a list.
  it('warms the claim-space allowlist on entering a debate', () => {
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(mocks.prefetchAllowlist).toHaveBeenCalledWith(true);
  });

  // GEO-2758. The picker that opens when this debate ends offers the claims related to the one
  // being argued, and finding them is three serial requests. Asked from here, they are answered
  // long before anyone is waiting on them.
  it('warms the claims related to the one being argued, once the debate is under way', () => {
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(mocks.warmRelatedClaims).toHaveBeenCalledWith(
      expect.objectContaining({ claim: expect.objectContaining({ claim_entity_id: 'claim-entity-1' }), enabled: true })
    );
  });

  // A preflight that times out, or a room nobody joins, is a debate that never happens — and a
  // warm cache for one is a request spent on nothing.
  it('does not warm them before the debate has started', () => {
    const now = Date.parse('2026-07-02T00:00:05.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      preflight_ends_at: new Date(now + 5_000).toISOString(),
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(mocks.warmRelatedClaims).toHaveBeenCalled();
    expect(mocks.warmRelatedClaims).not.toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('returns through browser history without rendering an already-completed room', async () => {
    setHistoryLength(2);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1'));
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
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
  it('returns a recording canceller to the page that opened the flow', async () => {
    setHistoryLength(2);
    rememberDebateReturnDestination('/space/my-space?tab=activity');
    mocks.debate = {
      ...completedDebate(),
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.queryByText('Debate complete.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/my-space?tab=activity'));
    expect(mocks.back).not.toHaveBeenCalled();
    expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1');
  });

  // Declining to publish and wanting another debate are unrelated choices, so the session the
  // debate anchored outlives the cancellation and the canceller stays where they can act on it.
  it('keeps the rematch the cancelled recording anchored, and does not eject the canceller', async () => {
    setHistoryLength(2);
    mocks.rematch = rematchSession('deciding');
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.clearDebateActivity).not.toHaveBeenCalled());
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  // The opponent is told the recording is gone, then put back on the thank-you screen: the debate
  // they already agreed to is still there to accept.
  it('returns the opponent to the flow after they acknowledge the removal', async () => {
    setHistoryLength(2);
    mocks.rematch = rematchSession('deciding');
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-b',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Your debate was removed')).toBeInTheDocument();
    // The notice is a dialog over the debate, not a replacement for it. Returning it early
    // unmounted the screen behind it and left the backdrop showing the app shell.
    expect(screen.getByText('Debate complete.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));

    await waitFor(() => expect(screen.queryByText('Your debate was removed')).not.toBeInTheDocument());
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  // A cold load has no rematch data yet, so the teardown waits for the answer instead of reading
  // "not loaded" as "still live" — which would leave the canceller sitting on a dead screen.
  it('tears the room down once an unloaded rematch resolves to expired', async () => {
    setHistoryLength(2);
    mocks.rematch = null;
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // Nothing is decided while the session is unknown.
    await waitFor(() => expect(screen.queryByText('Loading debate...')).not.toBeInTheDocument());
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.rematch = rematchSession('expired');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates'));
  });

  // Cancelling and then deciding against the rematch is the one exit left, and it was gated on
  // saving a recording that had just been discarded — so it failed every time.
  it('lets a canceller leave the surviving rematch without persisting a discarded recording', async () => {
    setHistoryLength(2);
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };
    mocks.rematch = rematchSession('deciding');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    expect(screen.queryByText('Could not save the local recording. Please try leaving again.')).not.toBeInTheDocument();
  });

  // The exception that keeps the old teardown honest: there is nothing left to return to, so
  // cancelling still ends the room rather than stranding the canceller on a dead screen.
  it('still ends the room when the rematch has already expired', async () => {
    setHistoryLength(2);
    mocks.rematch = rematchSession('expired');
    mocks.debate = {
      ...completedDebate(),
      rematch_session_id: 'rematch-1',
      recording_cancelled_at: '2026-07-02T00:01:20.000Z',
      recording_cancelled_by: 'user-a',
      recordings: [],
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates'));
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('shows the pre-screen while the debate is waiting for readiness', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video settings' })).toBeInTheDocument();
    // The intro carries mic and camera toggles, reversing GEO-2819's decision not to. The concern
    // that produced that decision — "muting the person you are about to introduce yourself to is
    // not a state worth supporting" — is answered by the gate below rather than by the absence of
    // the control: you can mute the introduction, you cannot carry it into a recorded debate.
    // Toggling still goes through `enabled` rather than LiveKit's `mute()`, so the recorder never
    // loses the track it captured at publish time.
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    // The issue asks for this line explicitly, and it has to stay true to when capture starts.
    // GEO-2819 asked for "this part isn't recorded" in so many words. The sentence is gone from the
    // copy, but the fact it was there to state is now on the tile the sentence was talking about,
    // in both of its states — which is the assertion below and the one worth keeping.
    expect(screen.getByText('Introduce yourselves before debating')).toBeInTheDocument();
    expect(screen.getByText('Speak to test your mic')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.queryByText('VS')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Debate recording' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalled();
    });
    expect(mocks.requestPersistentStorage).toHaveBeenCalledOnce();
  });

  // GEO-2819. The intro is a live two-way call, so the room is joined while the debate is still
  // `ready` — but `/joined` is not sent, because geo-chat rejects it in that state and nothing is
  // being timed yet.
  it('joins the LiveKit room for the intro without reporting the join', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    expect(mocks.markJoinedMutateAsync).not.toHaveBeenCalled();
    expect(mocks.startVoiceCallTelemetry).toHaveBeenCalledWith(
      expect.anything(),
      'debate',
      'debate-1',
      { debate_id: 'debate-1', participant_slot: 1, call_session_id: expect.any(String) },
      { probe: expect.any(Function) }
    );
    expect(screen.getByText('Not recording')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('joins and publishes when telemetry setup throws', async () => {
    mocks.startVoiceCallTelemetry.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const { unmount } = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalled());
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
    expect(screen.queryByText('telemetry unavailable')).not.toBeInTheDocument();
    unmount();
    expect(mocks.roomDisconnect).toHaveBeenCalled();
  });

  // `installRecordingMocks` matters: without it `MediaRecorder` is undefined in jsdom and
  // `startLocalRecorder` returns on its first line, so this asserted nothing. The debate is also
  // given a recording window, leaving the status gate as the only thing holding capture back.
  it('never starts the recorder during the intro', async () => {
    installRecordingMocks();
    mocks.debate = {
      ...readyDebate({ localReady: false, remoteReady: false }),
      preflight_ends_at: '2026-07-02T00:00:05.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Not recording')).toBeInTheDocument());
    expect(mocks.mediaRecorderConstruct).not.toHaveBeenCalled();
    expect(mocks.mediaRecorderStart).not.toHaveBeenCalled();
  });

  it('shows the opponent as present when they were already in the room', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.roomRemoteParticipants = new Map([['user-b', {}]]);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Waiting for Bri to join…')).not.toBeInTheDocument());
    expect(await screen.findByText('Waiting for video')).toBeInTheDocument();
  });

  it('does not replace the saved speaker when the connected debate refuses the chosen route', async () => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.roomSwitchActiveDevice.mockImplementation(async (_kind: string, id: string) => {
      if (id === 'speaker-2') throw new Error('No route');
      return true;
    });
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('radio', { name: 'Studio Speakers' }));
    expect(await screen.findByText(/Could not move audio to that speaker/)).toBeInTheDocument();
    expect(readMediaDevicePreference('audiooutput')).toBe('default');
  });

  it('reports a speaker the live room refuses to route to', async () => {
    mocks.roomSwitchActiveDevice.mockRejectedValue(new Error('no route'));
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));

    expect(await screen.findByText(/Could not move audio to that speaker/)).toBeInTheDocument();
  });

  // Swapping a device restarts the preview, which stops the tracks the in-flight connection is
  // publishing — the reconnect effect only covers a swap once the room is already up.
  it('closes the device pickers while a connection is settling', async () => {
    const pendingConnect = deferred<void>();
    mocks.roomConnect.mockReturnValueOnce(pendingConnect.promise);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Video settings' })).toBeDisabled());

    act(() => pendingConnect.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Video settings' })).toBeEnabled());
  });

  it('switches a camera on its publication without disconnecting or restarting the microphone', async () => {
    const audioTrack = createLocalAudioTrack();
    const videoTrack = {
      mediaStreamTrack: { kind: 'video', enabled: true },
      restartTrack: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      detach: vi.fn(),
    };
    mocks.createLocalTracks.mockResolvedValue([audioTrack, videoTrack]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const { unmount } = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Video settings');
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('radio', { name: 'Desk Camera' }));

    await waitFor(() => expect(videoTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'camera-2' } }));
    expect(mocks.roomConnect).toHaveBeenCalledTimes(1);
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(mocks.stopVoiceCallTelemetry).not.toHaveBeenCalled();

    unmount();
    expect(mocks.stopVoiceCallTelemetry).toHaveBeenCalledOnce();
    expect(mocks.roomDisconnect).toHaveBeenCalledOnce();
    expect(mocks.stopVoiceCallTelemetry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.roomDisconnect.mock.invocationCallOrder[0]
    );
  });

  // Once ready, the opponent's ready can flip the debate to `connecting` at any moment. The
  // republish effect only runs while `ready`, so a device swap still settling when that lands
  // would strand the debate on tracks `ensurePreview` stopped.
  it('locks the device pickers once this participant is ready', async () => {
    mocks.debate = readyDebate({ localReady: true, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Video settings' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Audio settings' })).toBeDisabled();
  });

  it('shows the opponent as still joining until they reach the room', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Waiting for Bri to join…')).toBeInTheDocument();

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    act(() => emitRoomEvent('participantConnected', {}));

    expect(await screen.findByText('Waiting for video')).toBeInTheDocument();

    act(() => emitRoomEvent('participantDisconnected', {}));
    expect(await screen.findByText('Bri left the room.')).toBeInTheDocument();
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
    expect(screen.getByText('Requesting camera and mic…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready to debate" })).not.toBeInTheDocument();
    // Still laid out, hidden and inert, so the screen does not jump when access is granted.
    const reservedReadyButton = screen.getByRole('button', { name: "I'm ready to debate", hidden: true });
    expect(reservedReadyButton.closest('[inert]')).toHaveClass('invisible');

    pendingTracks.resolve([createLocalAudioTrack(), { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeEnabled();
  });

  // GEO-2770. Each view below replaces a full-screen one, so anything else rendered in between
  // shows as a flash.
  describe('screen transitions', () => {
    const connectingDebate = (): Debate => ({
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    });

    it('shows the route loading state while the debate loads', () => {
      mocks.debate = null;
      mocks.debateLoading = true;

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.getByRole('status')).toHaveTextContent('Opening your debate room…');
      expect(screen.queryByText('Debate room')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading debate...')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back to debates' })).not.toBeInTheDocument();
    });

    it('goes straight from the intro to the recording view when the intro connected', async () => {
      mocks.debate = readyDebate({ localReady: true, remoteReady: false });
      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
      await screen.findByRole('button', { name: /Waiting for/ });

      mocks.debate = connectingDebate();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.getByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    });

    it('holds a full-screen state while a failed intro reconnects for the debate', async () => {
      mocks.liveKitJoinMutateAsync.mockRejectedValueOnce(new Error('intro failed'));
      mocks.debate = readyDebate({ localReady: true, remoteReady: false });
      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      expect(await screen.findByText('intro failed')).toBeInTheDocument();

      const ownership = deferred<{ acquired: boolean; waitedForLocalRelease: boolean }>();
      mocks.ownershipAcquire.mockReturnValueOnce(ownership.promise);
      mocks.debate = connectingDebate();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.queryByRole('dialog', { name: 'Debate readiness' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Connecting to the debate' })).toBeInTheDocument();
      expect(screen.queryByText('Debate room')).not.toBeInTheDocument();
      await waitFor(() => expect(mocks.ownershipAcquire).toHaveBeenCalledTimes(2));
      expect(screen.queryByText('Debate room')).not.toBeInTheDocument();

      await act(async () => ownership.resolve({ acquired: true, waitedForLocalRelease: false }));
      expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    });

    it('holds a full-screen state while rejoining a debate already under way', async () => {
      const ownership = deferred<{ acquired: boolean; waitedForLocalRelease: boolean }>();
      mocks.ownershipAcquire.mockReturnValueOnce(ownership.promise);
      mocks.debate = { ...completedDebate(), status: 'in_progress', completed_at: null };

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.getByRole('dialog', { name: 'Connecting to the debate' })).toBeInTheDocument();
      await waitFor(() => expect(mocks.ownershipAcquire).toHaveBeenCalledOnce());
      expect(screen.queryByText('Debate room')).not.toBeInTheDocument();

      await act(async () => ownership.resolve({ acquired: true, waitedForLocalRelease: false }));
      expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    });

    it('keeps the retry reachable once the debate connection has failed', async () => {
      mocks.liveKitJoinMutateAsync.mockRejectedValue(new Error('join failed'));
      mocks.debate = { ...connectingDebate(), status: 'preflight', preflight_ends_at: '2099-07-02T00:00:15.000Z' };

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(await screen.findByText('join failed')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Connecting to the debate' })).not.toBeInTheDocument();
    });

    it('holds a full-screen state instead of a blank page while leaving a finished debate', async () => {
      setHistoryLength(2);
      mocks.debate = completedDebate();

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.getByRole('dialog', { name: 'Leaving the debate' })).toBeInTheDocument();
      await waitFor(() => expect(mocks.back).toHaveBeenCalled());
      expect(screen.getByRole('dialog', { name: 'Leaving the debate' })).toBeInTheDocument();
    });

    it('keeps the recording surface visible while an idle room walks into the rematch', async () => {
      setHistoryLength(2);
      mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
      mocks.rematch = rematchSession('browsing');

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.queryByRole('dialog', { name: 'Leaving the debate' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
      const leaveButton = screen.getByRole('button', { name: 'Leave debate' });
      expect(leaveButton).toBeEnabled();
      fireEvent.click(leaveButton);
      await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
      await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    });

    it('holds focus, the scroll lock and a visible label while the holding screen is up', async () => {
      mocks.debate = completedDebate();

      const { unmount } = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      const holdingScreen = screen.getByRole('dialog', { name: 'Leaving the debate' });
      // The screens on either side take focus the same way; without this it falls to `body` and
      // the app shell behind the overlay stays reachable by keyboard.
      expect(holdingScreen).toHaveFocus();
      // `aria-modal` does not contain Tab on its own, and the app shell behind is still in the tab
      // order. Nothing here is focusable, so both directions are swallowed and focus stays put.
      expect(fireEvent.keyDown(holdingScreen, { key: 'Tab' })).toBe(false);
      expect(holdingScreen).toHaveFocus();
      expect(fireEvent.keyDown(holdingScreen, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(holdingScreen).toHaveFocus();
      // Both neighbours lock too, so the scrollbar never returns between them.
      expect(document.body.style.overflow).toBe('hidden');
      // Named on screen, not only to assistive tech: leaving and connecting are otherwise identical.
      expect(holdingScreen).toHaveTextContent('Leaving the debate');

      await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
      unmount();
      expect(document.body.style.overflow).toBe('');
    });

    it('keeps the removal notice reachable when it sits above the holding screen', async () => {
      const ownership = deferred<{ acquired: boolean; waitedForLocalRelease: boolean }>();
      mocks.ownershipAcquire.mockReturnValueOnce(ownership.promise);
      mocks.rematch = rematchSession('browsing');
      mocks.debate = {
        ...completedDebate(),
        status: 'thanking',
        completed_at: null,
        rematch_session_id: 'rematch-1',
        recording_cancelled_at: '2026-07-02T00:01:20.000Z',
        recording_cancelled_by: 'user-b',
        recordings: [],
      };

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      expect(screen.getByRole('dialog', { name: 'Connecting to the debate' })).toBeInTheDocument();
      const notice = screen.getByRole('dialog', { name: 'Your debate was removed' });
      // The notice is the top dialog, so it holds focus rather than the holding screen under it.
      expect(notice).toHaveFocus();
      fireEvent.keyDown(notice, { key: 'Tab' });
      expect(notice).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Okay' }));
      await waitFor(() => expect(screen.queryByText('Your debate was removed')).not.toBeInTheDocument());
    });

    it('spends the debate auto-connect when the intro connection lands after the debate starts', async () => {
      const connecting = deferred<void>();
      mocks.roomConnect.mockReturnValueOnce(connecting.promise);
      mocks.debate = readyDebate({ localReady: true, remoteReady: false });
      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());

      // The opponent presses ready while this handshake is still running, so the debate has already
      // left `ready` by the time the intro connection lands.
      mocks.debate = connectingDebate();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await act(async () => connecting.resolve());
      expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();

      act(() => emitRoomEvent('disconnected', 99));

      // The intro connection carried into the debate, so the drop offers a retry instead of reconnecting.
      expect(await screen.findByRole('button', { name: 'Retry connection' })).toBeInTheDocument();
      expect(mocks.roomConnect).toHaveBeenCalledOnce();
    });
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
    const audioTrack = createLocalAudioTrack();
    const videoTrack = {
      mediaStreamTrack: { kind: 'video', enabled: true },
      restartTrack: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };
    mocks.createLocalTracks.mockResolvedValue([audioTrack, videoTrack]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const audioTrigger = await screen.findByRole('button', { name: 'Audio settings' });
    expect(audioTrigger).toHaveAttribute('data-state', 'closed');
    await openDeviceSettings('Audio settings');
    const audioSettings = screen.getByRole('dialog', { name: 'Audio settings' });
    expect(audioSettings).toHaveAttribute('data-side', 'top');
    expect(audioSettings.closest('[data-radix-popper-content-wrapper]')?.parentElement).toHaveClass('elevated-popover');
    expect(audioTrigger).toHaveAttribute('data-state', 'open');
    expect(audioTrigger).toHaveAttribute('aria-controls', audioSettings.id);
    expect(screen.getByText('Select a microphone')).toBeInTheDocument();
    expect(screen.getByText('Select a speaker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));

    await waitFor(() => expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();

    await openDeviceSettings('Video settings');
    expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Video settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Desk Camera' }));

    await waitFor(() => expect(videoTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'camera-2' } }));
    expect(mocks.roomConnect).toHaveBeenCalledTimes(1);
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
  });

  it('shows the designed permission recovery state and retries access', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied by system policy'), { name: 'NotAllowedError' })
    );

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Allow access to your camera and microphone to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready to debate" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Audio settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }));

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeEnabled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2);
  });

  it('keeps readiness blocked when either required input is unavailable', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValueOnce([createLocalAudioTrack()]);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Connect a camera and microphone, then try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I'm ready to debate" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: "I'm ready to debate" })).not.toBeInTheDocument();
  });

  // GEO-2819 moved the room connection into the intro, so `debateRoomOptions` no longer sees a
  // speaker chosen afterwards — the live room has to be told. Capture is still never restarted.
  it('changes speaker output without restarting capture and hands the selection to LiveKit', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const selectedOutput = deferred<MediaDeviceInfo>();
    mocks.selectAudioOutput.mockReturnValueOnce(selectedOutput.promise);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    expect(mocks.roomConstruct).toHaveBeenCalledWith(
      expect.objectContaining({
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
        audioOutput: { deviceId: 'default' },
      })
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));
    await waitFor(() => expect(mocks.selectAudioOutput).toHaveBeenCalledWith({ deviceId: 'speaker-2' }));

    act(() =>
      selectedOutput.resolve({
        kind: 'audiooutput',
        deviceId: 'speaker-2',
        groupId: 'speaker-group-2',
        label: 'Studio Speakers',
        toJSON: () => ({}),
      })
    );

    await waitFor(() => expect(mocks.roomSwitchActiveDevice).toHaveBeenCalledWith('audiooutput', 'speaker-2'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(mocks.roomConstruct).toHaveBeenCalledTimes(1);
  });

  it('falls back to a non-editable System default when speaker routing is unsupported', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.supportsAudioOutputSelection.mockReturnValue(false);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');

    expect(await screen.findByRole('radio', { name: 'System default' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: 'Studio Speakers' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled();
  });

  it('keeps the working speaker selectable when live speaker authorization is rejected', async () => {
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() },
    ]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.selectAudioOutput.mockRejectedValueOnce(Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' }));

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Speakers' }));

    expect(
      await screen.findByText('Could not move audio to that speaker. Sound is still on the previous one.')
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'System default' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System default' })).not.toBeDisabled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));
    await waitFor(() => expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'System default' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Studio Speakers' })).toBeInTheDocument();
  });

  it('keeps the audible speaker checked when a newer live route fails', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const devices = await mocks.enumerateDevices();
    mocks.enumerateDevices.mockResolvedValue([
      ...devices,
      { kind: 'audiooutput', deviceId: 'speaker-3', groupId: 'speaker-group-3', label: 'Display Speakers' },
    ]);
    mocks.selectAudioOutput.mockImplementation(async ({ deviceId }: { deviceId: string }) => ({ deviceId }));
    const firstRoute = deferred<boolean>();
    const secondRoute = deferred<boolean>();
    mocks.roomSwitchActiveDevice.mockImplementation((_kind: string, id: string) => {
      if (id === 'speaker-2') return firstRoute.promise;
      if (id === 'speaker-3') return secondRoute.promise;
      return Promise.resolve(true);
    });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('radio', { name: 'Studio Speakers' }));
    await waitFor(() => expect(mocks.roomSwitchActiveDevice).toHaveBeenCalledWith('audiooutput', 'speaker-2'));
    fireEvent.click(await screen.findByRole('radio', { name: 'Display Speakers' }));
    await waitFor(() => expect(mocks.selectAudioOutput).toHaveBeenCalledWith({ deviceId: 'speaker-3' }));
    await act(async () => firstRoute.resolve(true));
    await waitFor(() => expect(mocks.roomSwitchActiveDevice).toHaveBeenCalledWith('audiooutput', 'speaker-3'));
    expect(screen.getByRole('radio', { name: 'Studio Speakers' })).toBeChecked();
    await act(async () => secondRoute.resolve(false));

    expect(
      await screen.findByText('Could not move audio to that speaker. Sound is still on the previous one.')
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Studio Speakers' })).toBeChecked();
    expect(readMediaDevicePreference('audiooutput')).toBe('speaker-2');
    expect(mocks.roomSwitchActiveDevice.mock.calls.filter(call => call[1] === 'speaker-2')).toHaveLength(1);
    expect(mocks.roomSwitchActiveDevice.mock.lastCall).toEqual(['audiooutput', 'speaker-3']);
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(mocks.roomConstruct).toHaveBeenCalledTimes(1);
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
    await openDeviceSettings('Audio settings');
    // Awaited, not `getByRole`: the speaker list is populated from `enumerateDevices`, and
    // selecting a speaker re-renders it while that selection is still pending — so a name can be
    // briefly absent between two clicks. A synchronous query here made this test fail about one run
    // in four, on this branch and on master alike.
    fireEvent.click(await screen.findByRole('radio', { name: 'Studio Speakers' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Display Speakers' }));

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
    const trigger = await openDeviceSettingsFocused('Audio settings');
    const settings = screen.getByRole('dialog', { name: 'Audio settings' });

    fireEvent.keyDown(settings, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes desktop settings on outside click and returns focus to the trigger', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await openDeviceSettings('Audio settings');
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
    const trigger = await openDeviceSettings('Audio settings');
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
  });

  it('supports keyboard device selection without closing the desktop menu', async () => {
    const videoTrack = {
      mediaStreamTrack: { kind: 'video', enabled: true },
      restartTrack: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack(), videoTrack]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Video settings');
    const selectedCamera = screen.getByRole('radio', { name: 'HD Pro Webcam' });
    selectedCamera.focus();
    fireEvent.keyDown(selectedCamera, { key: 'ArrowDown' });
    await waitFor(() => expect(videoTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'camera-2' } }));
    expect(screen.getByRole('dialog', { name: 'Video settings' })).toBeInTheDocument();
  });

  it('keeps the desktop menu open and the camera visible while a microphone is restarting', async () => {
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() },
    ]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    const localVideo = debateVideoTile('local').querySelector('video')!;
    const cameraStream = localVideo.srcObject;
    const pending = deferred<void>();
    audioTrack.restartTrack.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));
    await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeDisabled());
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();
    expect(screen.queryByText('Switching device…')).not.toBeInTheDocument();
    act(() => pending.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
    expect(localVideo.srcObject).toBe(cameraStream);
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
  });

  it('opens mobile video settings as a bottom sheet using the existing camera capture', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Video settings');

    expect(screen.getByRole('dialog', { name: 'Video settings' })).toHaveAttribute('data-layout', 'bottom-sheet');
    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    expect((videos[0]?.srcObject as MediaStream).getVideoTracks()).toEqual(
      (videos[1]?.srcObject as MediaStream).getVideoTracks()
    );
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('opens mobile audio settings with microphone and speaker groups', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    expect(await screen.findByText('Speak to test your mic')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio settings' }).parentElement).toHaveClass('gap-[6px]');
    await openDeviceSettings('Audio settings');

    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toHaveAttribute('data-layout', 'bottom-sheet');
    expect(screen.getByText('Select a microphone')).toBeInTheDocument();
    expect(screen.getByText('Select a speaker')).toBeInTheDocument();
  });

  it('returns focus to the mobile settings trigger after closing the sheet', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    setMobileLayout(true);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    const trigger = await openDeviceSettings('Audio settings');
    expect(screen.getByRole('dialog', { name: 'Audio settings' })).toHaveAttribute('data-layout', 'bottom-sheet');

    fireEvent.click(screen.getByRole('button', { name: 'Close Audio settings' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audio settings' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('moves only the missing microphone to the fallback without dropping the call', async () => {
    const audioTrack = createLocalAudioTrack();
    const cameraStop = vi.fn();
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: cameraStop },
    ]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await openDeviceSettings('Audio settings');
    fireEvent.click(screen.getByRole('radio', { name: 'Studio Mic' }));
    await waitFor(() => expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    audioTrack.restartTrack.mockClear();
    await act(async () => mocks.deviceChangeHandler?.());
    expect(audioTrack.restartTrack).not.toHaveBeenCalled();

    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    ]);
    await act(async () => mocks.deviceChangeHandler?.());
    await waitFor(() => expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-1' } }));
    expect(mocks.roomConnect).toHaveBeenCalledTimes(1);
    expect(mocks.roomDisconnect).not.toHaveBeenCalled();
    expect(cameraStop).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('ignores stale device enumeration results during rapid hardware changes', async () => {
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() },
    ]);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await screen.findByRole('button', { name: "I'm ready to debate" });
    const olderEnumeration = deferred<MediaDeviceInfo[]>();
    mocks.enumerateDevices.mockReturnValueOnce(olderEnumeration.promise).mockResolvedValueOnce([
      { kind: 'audioinput', deviceId: 'mic-2', groupId: 'mic-group-2', label: 'Studio Mic' },
      { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    ]);

    act(() => mocks.deviceChangeHandler?.());
    act(() => mocks.deviceChangeHandler?.());

    await waitFor(() => expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));

    act(() =>
      olderEnumeration.resolve([
        { kind: 'audioinput', deviceId: 'mic-1', groupId: 'mic-group-1', label: 'Shure MV7+' },
        { kind: 'audiooutput', deviceId: 'default', groupId: 'speaker-group-1', label: 'System default' },
        { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
      ] as MediaDeviceInfo[])
    );

    await openDeviceSettings('Audio settings');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Studio Mic' })).toBeChecked());
  });

  it('shows the opponent as ready while the local participant can still become ready', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: true });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(within(debateVideoTile('remote')).getByText('Ready')).toBeInTheDocument();
    expect(within(debateVideoTile('local')).queryByText('Ready')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: "I'm ready to debate too" })).toBeEnabled();
  });

  it('shows the opponent as not ready rather than showing nothing', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeInTheDocument();
    expect(within(debateVideoTile('remote')).getByText('Not ready')).toBeInTheDocument();
    expect(within(debateVideoTile('local')).queryByText('Not ready')).not.toBeInTheDocument();
  });

  it('arrives in the state the picker was in', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    rememberRematchJoinIntent('debate-1', { micOn: false, cameraOn: false, source: 'card' });

    render(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
  });

  // A choice with no camera answer in it (the type allows one; a lobby carry omits it) keeps the
  // room's own camera default.
  it('keeps its default camera when the picker recorded only the mic', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    rememberRematchJoinIntent('debate-1', { micOn: false, source: 'card' });

    render(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
  });

  it('prefers what a card handed over to what a picker recorded', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    rememberRematchJoinIntent('debate-1', { micOn: false, cameraOn: false, source: 'card' });
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack()]);

    const view = render(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('1'));

    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument());
    expect(await screen.findByText('Enable video to start')).toBeInTheDocument();
  });

  it('keeps its own defaults when no picker chose for it', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValue([
      createLocalAudioTrack(),
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    render(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
  });

  it('keeps the hand-off’s state through a dropped intro connection', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValue([
      createLocalAudioTrack(),
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    const view = render(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={{ audio: true, video: true }} />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('2'));

    view.rerender(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={{ audio: true, video: true }} />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    // Room mount and the reconnect's device reopen both run past the default 1s on a loaded CI runner.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument(), {
      timeout: 3000,
    });
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(mocks.roomOn).toHaveBeenCalledWith('disconnected', expect.any(Function)));
    mocks.createLocalTracks.mockClear();

    act(() => emitRoomEvent('disconnected', 99));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled(), { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: expect.anything(), video: expect.anything() })
    );
  });

  // The card's mic is live, so turning its camera on keeps the preview 'ready' while the camera is
  // still opening, and the intro connection can start before the hand-off has landed.
  it('keeps the hand-off’s state when the intro connection drops while the card was still adding the camera', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const camera = deferred<unknown[]>();
    mocks.createLocalTracks.mockResolvedValueOnce([createLocalAudioTrack()]);
    mocks.createLocalTracks.mockReturnValueOnce(camera.promise);
    mocks.createLocalTracks.mockResolvedValue([
      createLocalAudioTrack(),
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    const view = render(
      <DebateMediaSessionProvider>
        <CameraAddedHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));

    view.rerender(
      <DebateMediaSessionProvider>
        <CameraAddedHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.roomOn).toHaveBeenCalledWith('disconnected', expect.any(Function)));

    await act(async () => {
      camera.resolve([{ mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() }]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('2'));

    act(() => emitRoomEvent('disconnected', 99));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
  });

  // A card opened over a live lobby leaves the mic to it; the room joins with the mic the lobby
  // carried, and opens it.
  it.each([
    { lobbyMicOn: true, button: 'Mute microphone' },
    { lobbyMicOn: false, button: 'Unmute microphone' },
  ])('takes the mic a card left to the lobby from the lobby (on: $lobbyMicOn)', async ({ lobbyMicOn, button }) => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    lobbyCaptureCleanup = registerLobbyCapture('audio', { on: lobbyMicOn, release: vi.fn() });
    reportLobbyMic(lobbyMicOn);
    carryLobbyJoinChoice();

    const view = render(
      <DebateMediaSessionProvider>
        <CardOverLobby />
      </DebateMediaSessionProvider>
    );
    await screen.findByText(lobbyMicOn ? 'Joining with mic on, camera off' : 'Joining listening only');
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
    // The lobby page goes on the way in.
    lobbyCaptureCleanup();

    view.rerender(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
    if (lobbyMicOn) {
      await waitFor(() =>
        expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.anything() }))
      );
    } else {
      expect(mocks.createLocalTracks).not.toHaveBeenCalledWith(expect.objectContaining({ audio: expect.anything() }));
    }
  });

  // The card is gone before the lobby lets go, so only the room can open the mic.
  it('opens the lobby’s live mic itself once the card is gone', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    lobbyCaptureCleanup = registerLobbyCapture('audio', { on: true, release: vi.fn() });
    reportLobbyMic(true);
    carryLobbyJoinChoice();

    const view = render(
      <DebateMediaSessionProvider>
        <CardOverLobby />
      </DebateMediaSessionProvider>
    );
    await screen.findByText('Joining with mic on, camera off');

    view.rerender(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    lobbyCaptureCleanup();

    expect(await screen.findByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.anything() }))
    );
  });

  it('keeps a mic turned off on the card over the lobby’s', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    lobbyCaptureCleanup = registerLobbyCapture('audio', { on: true, release: vi.fn() });
    reportLobbyMic(true);
    carryLobbyJoinChoice();

    const view = render(
      <DebateMediaSessionProvider>
        <CardOverLobby />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Turn microphone off' }));
    await screen.findByText('Joining listening only');
    lobbyCaptureCleanup();

    view.rerender(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    expect(await screen.findByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument();
  });

  it('arrives with the toggles the card showed', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack()]);

    const view = render(
      <DebateMediaSessionProvider>
        <CardOverLobby />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Turn microphone on' }));
    await screen.findByText('Joining with mic on, camera off');
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    view.rerender(
      <DebateMediaSessionProvider>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    expect(await screen.findByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
  });

  it('opens no devices for a hand-off that chose neither', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('0'));

    view.rerender(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('Enable video and audio to start')).toBeInTheDocument();
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
  });

  it('joins the intro receive-only for a hand-off that chose neither', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('0'));

    view.rerender(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument());
    expect(mocks.publishTrack).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
  });

  it('publishes the mic turned on after joining the intro listening only', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValue([audioTrack]);

    const view = render(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('0'));
    view.rerender(
      <DebateMediaSessionProvider>
        <ListeningOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));

    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledWith(audioTrack), {
      timeout: 3000,
    });
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
    expect(mocks.roomConnect).toHaveBeenCalledTimes(1);
  });

  it.each(['publication', 'processing'] as const)(
    'keeps a newly enabled camera when earlier microphone %s finishes',
    async stage => {
      mocks.debate = readyDebate({ localReady: false, remoteReady: false });
      const audio = createLocalAudioTrack();
      const video = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() };
      const pending = deferred<void>();
      const observePreview = vi.fn();
      if (stage === 'publication') mocks.publishTrack.mockReturnValueOnce(pending.promise);
      else mocks.krispSetEnabled.mockReturnValueOnce(pending.promise);
      mocks.createLocalTracks.mockResolvedValueOnce([audio]).mockResolvedValueOnce([video]);
      const content = (room: boolean) => (
        <DebateMediaSessionProvider>
          <ListeningOnlyHandover />
          <MediaPreviewObserver onChange={observePreview} />
          {room && <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />}
        </DebateMediaSessionProvider>
      );
      const view = render(content(false));
      await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('0'));
      view.rerender(content(true));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
      await waitFor(() =>
        expect(stage === 'publication' ? mocks.publishTrack : mocks.krispSetEnabled).toHaveBeenCalled()
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
      await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('2'));
      const localVideo = () => document.querySelector('video.object-cover') as HTMLVideoElement;
      expect((localVideo().srcObject as MediaStream).getVideoTracks()).toEqual([video.mediaStreamTrack]);
      await act(async () => pending.resolve());
      await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
      expect((localVideo().srcObject as MediaStream).getVideoTracks()).toEqual([video.mediaStreamTrack]);
      const preview = observePreview.mock.calls.at(-1)?.[0] as MediaStream;
      expect(preview.getVideoTracks()).toEqual([video.mediaStreamTrack]);
      expect(preview.getAudioTracks()).toEqual([audio.mediaStreamTrack]);
      expect(mocks.publishTrack.mock.calls.map(call => call[0])).toEqual([audio, video]);
      expect(mocks.roomConnect).toHaveBeenCalledOnce();
    }
  );

  it('keeps the handed-over camera when initial microphone processing finishes', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audio = createLocalAudioTrack();
    const video = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() };
    const camera = deferred<unknown[]>();
    const processing = deferred<void>();
    const observePreview = vi.fn();
    mocks.createLocalTracks.mockResolvedValueOnce([audio]).mockReturnValueOnce(camera.promise);
    mocks.krispSetEnabled.mockReturnValueOnce(processing.promise);
    const content = (room: boolean) => (
      <DebateMediaSessionProvider>
        <CameraAddedHandover />
        <MediaPreviewObserver onChange={observePreview} />
        {room && <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />}
      </DebateMediaSessionProvider>
    );
    const view = render(content(false));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));
    view.rerender(content(true));
    await waitFor(() => expect(mocks.krispSetEnabled).toHaveBeenCalledOnce());
    await act(async () => camera.resolve([video]));
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('2'));
    await act(async () => processing.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
    const localVideo = document.querySelector('video.object-cover') as HTMLVideoElement;
    expect((localVideo.srcObject as MediaStream).getVideoTracks()).toEqual([video.mediaStreamTrack]);
    const preview = observePreview.mock.calls.at(-1)?.[0] as MediaStream;
    expect(preview.getVideoTracks()).toEqual([video.mediaStreamTrack]);
    expect(preview.getAudioTracks()).toEqual([audio.mediaStreamTrack]);
    expect(mocks.publishTrack.mock.calls.map(call => call[0])).toEqual([audio, video]);
    expect(mocks.roomConnect).toHaveBeenCalledOnce();
  });

  it('holds readiness while a newly enabled camera is still publishing', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    const videoTrack = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn() };
    mocks.createLocalTracks.mockResolvedValueOnce([audioTrack]);
    const view = render(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('1'));
    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeEnabled());
    mocks.createLocalTracks.mockResolvedValueOnce([videoTrack]);
    const publishing = deferred<void>();
    mocks.publishTrack.mockImplementation(track => (track === videoTrack ? publishing.promise : Promise.resolve()));
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledWith(videoTrack));
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    expect(mocks.readyMutateAsync).not.toHaveBeenCalled();
    await act(async () => publishing.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
    expect(mocks.roomConnect).toHaveBeenCalledOnce();
  });

  it('keeps the mic and the controls when the camera turned on beside it fails', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValueOnce([audioTrack]);

    const view = render(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('1'));
    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledWith(audioTrack));
    const connectsBefore = mocks.roomConnect.mock.calls.length;
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(
      await screen.findByText('Your camera may be in use by another app. Close it and try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(mocks.roomConnect).toHaveBeenCalledTimes(connectsBefore);

    const videoTrack = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValueOnce([videoTrack]);
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledWith(videoTrack), {
      timeout: 3000,
    });
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    expect(
      screen.queryByText('Your camera may be in use by another app. Close it and try again.')
    ).not.toBeInTheDocument();
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
    expect(audioTrack.stop).not.toHaveBeenCalled();
  });

  it('tries a failed camera once when the debate refetches while it is opening', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    mocks.createLocalTracks.mockResolvedValueOnce([audioTrack]);

    const view = render(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('1'));
    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledWith(audioTrack));
    const camera = deferred<unknown[]>();
    mocks.createLocalTracks.mockReturnValueOnce(camera.promise);
    mocks.createLocalTracks.mockResolvedValue([
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));
    mocks.debate = { ...readyDebate({ localReady: false, remoteReady: false }) };
    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    await act(async () => {
      camera.reject(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));
      await Promise.resolve();
    });

    expect(
      await screen.findByText('Your camera may be in use by another app. Close it and try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2);
  });

  it('waits for a hand-off still in flight rather than closing it', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    let open!: (tracks: unknown[]) => void;
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        open = resolve;
      })
    );
    const audioTrack = createLocalAudioTrack();
    const videoTrack = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    const kinds = { audio: true, video: true };

    const view = render(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={kinds} />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    mocks.createLocalTracks.mockClear();

    view.rerender(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={kinds} />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    await act(async () => {
      open([audioTrack, videoTrack]);
      await Promise.resolve();
    });

    // Kept, not closed and reopened.
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('2'));
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(videoTrack.stop).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
  });

  it('starts from the card’s choice while its devices are still opening', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    let open!: (tracks: unknown[]) => void;
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        open = resolve;
      })
    );
    const kinds = { audio: true, video: true };

    const view = render(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={kinds} />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    view.rerender(
      <DebateMediaSessionProvider>
        <InFlightHandover kinds={kinds} />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );
    // Neither device reads as off while the card is still opening them.
    expect(screen.queryByText('Enable video and audio to start')).toBeNull();

    await act(async () => {
      open([
        createLocalAudioTrack(),
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ]);
      await Promise.resolve();
    });

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  /*
   * Arriving from a card that chose mic-only. The room requires both kinds to be ready, but it must
   * not go and get the camera on arrival.
   */
  it('does not reach for the camera when a card handed over the microphone only', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack()]);

    // The card's session, opened and settled before the room mounts.
    const view = render(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
      </DebateMediaSessionProvider>
    );
    await waitFor(() => expect(screen.getByTestId('handover-tracks')).toHaveTextContent('1'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    mocks.createLocalTracks.mockClear();

    view.rerender(
      <DebateMediaSessionProvider>
        <MicOnlyHandover />
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </DebateMediaSessionProvider>
    );

    // The gate holds, and nothing went looking for a camera to satisfy it.
    expect(await screen.findByText('Enable video to start')).toBeInTheDocument();
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
    // Nor was the preview re-announced over a session that already had one.
    expect(screen.queryByText('Requesting camera and mic…')).toBeNull();
  });

  it('starts muted for a viewer who was muted in the lobby they just left', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    reportLobbyMic(false);
    carryLobbyJoinChoice();

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument();

    // Spent on arrival: the next room starts unmuted again.
    cleanup();
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-2" />);
    expect(await screen.findByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
  });

  it('starts with the camera the viewer had in the lobby they just left', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    reportLobbyMic(true);
    reportLobbyCamera(false);
    carryLobbyJoinChoice();
    forgetLobbyDevices();
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack()]);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    expect(mocks.createLocalTracks.mock.calls.every(([options]) => !options?.video)).toBe(true);
  });

  // The intro's answer to GEO-2819's objection to having these toggles at all: the state is
  // reachable, and it is not a state a recorded debate can start from.
  it('holds readiness back until the microphone and the camera are both on', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: "I'm ready to debate" })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));

    expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeDisabled();
    expect(screen.getByText('Enable audio to start')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));

    expect(screen.getByText('Enable video and audio to start')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));

    expect(screen.getByText('Enable video to start')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled();
    expect(screen.queryByText('Enable video to start')).not.toBeInTheDocument();
  });

  // The room orders its tiles by which side of the claim each speaker holds. The intro does not:
  // it is about your own setup, so you are on the left of it whichever side you are arguing.
  it('puts you on the left of the intro screen whichever position you hold', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await screen.findByRole('button', { name: "I'm ready to debate" });
    // The card wrapping your tile takes the first column; the document order is the mobile one,
    // where your opponent is on top and you sit directly above your own controls.
    expect(debateVideoTile('local').parentElement).toHaveClass('order-1');
    expect(debateVideoTile('remote').parentElement).toHaveClass('order-2');
  });

  // The neutral state is the assurance, so it has to be somewhere the eye already is: on the tile
  // showing the camera it is talking about.
  it('puts the not-recording pill in the local tile on the intro screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await screen.findByRole('button', { name: "I'm ready to debate" });
    expect(within(debateVideoTile('local')).getByText('Not recording')).toBeInTheDocument();
    expect(within(debateVideoTile('remote')).queryByText('Not recording')).not.toBeInTheDocument();
  });

  it('disables the ready button while waiting for the opponent', async () => {
    mocks.debate = readyDebate({ localReady: true, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('button', { name: 'Waiting for Bri…' })).toBeDisabled();
    // Your own readiness is the button, not a badge: the bottom-right of your tile is the recording
    // indicator, and two different places to read "ready" was the state this screen used to be in.
    expect(within(debateVideoTile('local')).getByText('Not recording')).toBeInTheDocument();
    expect(within(debateVideoTile('local')).queryByText('Ready')).not.toBeInTheDocument();
    expect(within(debateVideoTile('remote')).getByText('Not ready')).toBeInTheDocument();
  });

  // The intro screen and the debate room own different media elements, and the status flip swaps
  // one set for the other without touching the LiveKit connection. Bound once at the end of
  // `connect`, both tiles came up blank on the other side of that swap.
  it('carries the remote track and the local preview across the ready to connecting swap', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    const remoteVideo = document.createElement('video');
    const track = { kind: 'video', attach: () => remoteVideo, detach: vi.fn(() => [remoteVideo]) };
    act(() => emitRoomEvent('trackSubscribed', track));
    expect(document.body.contains(remoteVideo)).toBe(true);

    const introLocalVideo = document.querySelector('video.object-cover') as HTMLVideoElement;
    expect(introLocalVideo).toBeInstanceOf(HTMLVideoElement);
    expect(introLocalVideo.srcObject).toBeTruthy();

    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(document.body.contains(remoteVideo)).toBe(true);
    const roomLocalVideo = document.querySelector('video.object-cover') as HTMLVideoElement;
    expect(roomLocalVideo).not.toBe(introLocalVideo);
    expect(roomLocalVideo.srcObject).toBeTruthy();
  });

  it('reports the join on the intro connection rather than reconnecting', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledTimes(1));
    expect(mocks.markJoinedMutateAsync).not.toHaveBeenCalled();

    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.roomConnect).toHaveBeenCalledTimes(1);
    expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledTimes(1);
  });

  // Turn-taking mutes the microphone track for whoever is not speaking. Applied to the intro, that
  // silenced the introductions and the mic meter along with them.
  it('keeps the microphone live during the intro', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    const audioTrack = createLocalAudioTrack();
    const videoTrack = { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([audioTrack, videoTrack]);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
  });

  /**
   * The recorder and the self-preview run off a MediaStream captured once, at publish time. For a
   * camera track LiveKit's `mute()` stops the underlying MediaStreamTrack and `unmute()` acquires a
   * replacement, which that stream would never see: the opponent's feed would recover while the
   * recording carried on against an ended track. Toggling has to stay `enabled`-only, which sends
   * black frames over one track that stays live for the whole recording.
   */
  it('turns the camera off without stopping the track the recorder holds', async () => {
    const videoTrack = {
      mediaStreamTrack: { kind: 'video', enabled: true },
      mute: vi.fn().mockResolvedValue(undefined),
      unmute: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      detach: vi.fn(),
    };
    mocks.createLocalTracks.mockResolvedValue([createLocalAudioTrack(), videoTrack]);
    // The room's own camera toggle sits behind the debugging flag, and is the only one left once
    // the intro's was removed.
    mocks.featureFlags.debateDebugging = true;
    mocks.debate = { ...completedDebate(), status: 'in_progress', completed_at: null };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    await waitFor(() => expect(videoTrack.mediaStreamTrack.enabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await waitFor(() => expect(videoTrack.mediaStreamTrack.enabled).toBe(true));

    expect(videoTrack.mute).not.toHaveBeenCalled();
    expect(videoTrack.unmute).not.toHaveBeenCalled();
    expect(videoTrack.stop).not.toHaveBeenCalled();
  });

  // The budget is spent across the whole connecting window, not per invocation. Depending on the
  // mutation object made this callback new on every render, and the 500ms countdown tick then
  // restarted the series twice a second — dozens of requests, one of which can land after the
  // connecting deadline and cancel the debate from the client side.
  it('gives up on /joined after a fixed number of attempts rather than once per render', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.markJoinedMutateAsync.mockRejectedValue(new Error('nope'));
      mocks.debate = readyDebate({ localReady: false, remoteReady: false });

      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

      mocks.debate = {
        ...readyDebate({ localReady: true, remoteReady: true }),
        status: 'connecting',
        connecting_started_at: '2099-07-02T00:00:00.000Z',
        connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      };
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalledTimes(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(mocks.markJoinedMutateAsync).toHaveBeenCalledTimes(3);
      expect(await screen.findByText(/Could not tell the server you are here/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers when a /joined attempt fails and the next succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.markJoinedMutateAsync.mockRejectedValueOnce(new Error('nope'));
      mocks.debate = readyDebate({ localReady: false, remoteReady: false });

      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

      mocks.debate = {
        ...readyDebate({ localReady: true, remoteReady: true }),
        status: 'connecting',
        connecting_started_at: '2099-07-02T00:00:00.000Z',
        connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      };
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(mocks.markJoinedMutateAsync).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Could not tell the server you are here/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // The intro can now lose an ownership race, which it never could before — and adding `ready` to
  // the takeover statuses suppresses the full-screen "already open in another tab" fallback, so
  // the intro has to carry the affordance itself.
  it('offers a way back when another tab holds the debate during the intro', async () => {
    // Hidden on purpose: a tab in front of the viewer reclaims by itself, and this is about the case
    // that has no automatic rescue. Left to the ambient value this passed alone and hung under load.
    setDocumentVisibility('hidden');
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('This debate is already open in another tab.')).toBeInTheDocument();
    const continueHere = await screen.findByRole('button', { name: 'Continue here' });

    mocks.ownershipRequestTakeover.mockResolvedValue(true);
    fireEvent.click(continueHere);

    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalled());
  });

  it('holds readiness back while the connection is still settling', async () => {
    const pendingConnect = deferred<void>();
    mocks.roomConnect.mockReturnValueOnce(pendingConnect.promise);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Connecting…' })).toBeDisabled();

    act(() => pendingConnect.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
  });

  // Disabling the trigger is not enough: an open picker keeps its radios clickable.
  it('closes an open device picker when a connection starts', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    await openDeviceSettings('Video settings');
    expect(screen.getByRole('radio', { name: 'Desk Camera' })).toBeInTheDocument();

    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    mocks.roomConnect.mockReturnValueOnce(deferred<void>().promise);
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Desk Camera' })).not.toBeInTheDocument());
  });

  it('marks the local participant ready from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: "I'm ready to debate" }));

    await waitFor(() => {
      expect(mocks.readyMutateAsync).toHaveBeenCalled();
    });
  });

  it('lets the Ready click start incoming audio the browser held back', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: "I'm ready to debate" }));

    expect(mocks.roomStartAudio).toHaveBeenCalled();
  });

  it.each([true, false])(
    'offers to enable blocked audio on the pre-screen once Ready is pressed (ready: %s)',
    async localReady => {
      mocks.debate = readyDebate({ localReady, remoteReady: false });

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.publishTrack).toHaveBeenCalled());
      mocks.roomCanPlaybackAudio = false;
      act(() => emitRoomEvent('audioPlaybackChanged', false));

      if (!localReady) {
        // The Ready click is the gesture that unblocks it.
        await waitFor(() => expect(screen.getByRole('button', { name: "I'm ready to debate" })).toBeEnabled());
        expect(screen.queryByRole('button', { name: 'Enable audio' })).not.toBeInTheDocument();
        return;
      }
      fireEvent.click(await screen.findByRole('button', { name: 'Enable audio' }));
      expect(mocks.roomStartAudio).toHaveBeenCalled();
    }
  );

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
    setDocumentVisibility('hidden');
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
    setDocumentVisibility('hidden');
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

  it('reclaims automatically from a visible but unfocused window, marking the request automatic', async () => {
    // A window beside a video call: visible, never focused. GEO-3149 — a hidden tab must not hold
    // the room against it, so it asks on its own; the owner decides by comparing attention.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledWith({ automatic: true }));
    await waitFor(() => expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalledOnce());
  });

  it('never reclaims automatically from a hidden tab', async () => {
    setDocumentVisibility('hidden');
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('This debate is already open in another tab.')).toBeInTheDocument();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.ownershipRequestTakeover).not.toHaveBeenCalled();

    // Turning to it is what reclaims it.
    setDocumentVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(mocks.ownershipRequestTakeover).toHaveBeenCalledWith({ automatic: true }));
  });

  it("stops listening to the opponent's audio once the room is torn down (GEO-3407)", async () => {
    const contexts = installSpeechAnalysisMocks();
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    const remoteAudio = { kind: 'audio', id: 'remote-audio' } as unknown as MediaStreamTrack;
    const element = document.createElement('audio');
    act(() =>
      emitRoomEvent('trackSubscribed', {
        kind: 'audio',
        mediaStreamTrack: remoteAudio,
        attach: () => element,
        detach: vi.fn(() => [element]),
      })
    );
    const listening = () => contexts.filter(context => context.tracks.includes(remoteAudio));
    await waitFor(() => expect(listening()).toHaveLength(1));
    expect(listening()[0]?.close).not.toHaveBeenCalled();

    // Torn down without a reconnect, and without the old room ever unsubscribing the track: the
    // same as handing the room to another tab.
    act(() => emitRoomEvent('disconnected', 2));
    expect(await screen.findByText('This debate is active in another tab or device.')).toBeInTheDocument();
    expect(mocks.roomConnect).toHaveBeenCalledOnce();
    await waitFor(() => expect(listening()[0]?.close).toHaveBeenCalled());
  });

  it('refuses an automatic takeover from a tab no nearer the viewer, and honours an explicit one', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());

    // Two windows side by side, both visible and unfocused: handing over here would only start a
    // round of handing back.
    await expect(
      Promise.resolve(mocks.ownershipTakeoverHandler?.({ requesterPriority: 1, ownerPriority: 1, automatic: true }))
    ).resolves.toBe(false);
    expect(screen.queryByText('This debate moved to another tab.')).not.toBeInTheDocument();

    let released: boolean | undefined;
    await act(async () => {
      released = await mocks.ownershipTakeoverHandler?.({ requesterPriority: 1, ownerPriority: 1, automatic: false });
    });
    expect(released).toBe(true);
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
    setDocumentVisibility('hidden');
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
      Promise.resolve(mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2, automatic: false }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates');
    expect(screen.queryByRole('button', { name: 'Continue here' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to debates' })).not.toBeInTheDocument();
    expect(screen.queryByText('Debate room')).not.toBeInTheDocument();
    expect(screen.queryByText('in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for both speakers to join.')).not.toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
    expect(mocks.roomConnect).not.toHaveBeenCalled();
  });

  it('returns a secondary tab ownership conflict to the page that opened the room', async () => {
    rememberDebateReturnDestination('/space/root-space?tab=activity');
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="opponent-space" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Go back' }));

    expect(mocks.replace).toHaveBeenCalledWith('/space/root-space?tab=activity');
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('keeps trying to sync the debate clock after a failed sync rather than staying on the local clock (GEO-3407)', async () => {
    mocks.getServerTime.mockRejectedValue(new Error('offline'));
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'preflight',
      preflight_ends_at: new Date(Date.now() + 60_000).toISOString(),
      started_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.getServerTime).toHaveBeenCalledTimes(3));

    mocks.getServerTime.mockImplementation(() => Promise.resolve({ server_time_ms: Date.now() }));
    // The first retry, one sample per request as before.
    await waitFor(() => expect(mocks.getServerTime).toHaveBeenCalledTimes(6), { timeout: 4_000 });
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
      Promise.resolve(mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2, automatic: false }))
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

  it('keeps new opponent video visible when the old session unsubscribes and leaves late', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalledOnce());
    const oldVideo = document.createElement('video');
    const newVideo = document.createElement('video');
    const oldTrack = { kind: 'video', attach: () => oldVideo, detach: () => [oldVideo] };
    const newTrack = { kind: 'video', attach: () => newVideo, detach: () => [newVideo] };
    act(() => emitRoomEvent('trackSubscribed', oldTrack));
    act(() => emitRoomEvent('trackSubscribed', newTrack));
    act(() => emitRoomEvent('trackUnsubscribed', oldTrack));
    act(() => emitRoomEvent('participantDisconnected', {}));
    expect(document.body.contains(newVideo)).toBe(true);
    expect(screen.queryByText('Waiting for video')).not.toBeInTheDocument();
    expect(screen.queryByText('Bri left the room.')).not.toBeInTheDocument();
  });

  // GEO-2602, reported as "audio but no video from opponent". Reconnecting cleared the remote
  // tiles and the code assumed the tracks would come back as fresh TrackSubscribed events. They
  // do not: LiveKit reconnects by ICE restart and the subscriptions survive it, so nothing
  // re-fires and nothing re-attaches. The opponent's tile then stays empty for the rest of the
  // debate.
  it('puts the opponent back on screen after a reconnect', async () => {
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

    act(() => emitRoomEvent('reconnecting'));
    expect(document.body.contains(remoteVideo)).toBe(false);

    // No second trackSubscribed — that is the whole point.
    act(() => emitRoomEvent('reconnected'));

    expect(document.body.contains(remoteVideo)).toBe(true);
  });

  // Why the report was "audio but no video" rather than "the call went silent": an element removed
  // from the DOM keeps playing, so stripping the container orphaned a live audio element. The
  // track has to be detached, not just unparented.
  it('detaches remote audio on a reconnect rather than orphaning a still-playing element', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    const remoteAudio = document.createElement('audio');
    const track = { kind: 'audio', attach: () => remoteAudio, detach: vi.fn(() => [remoteAudio]) };

    act(() => emitRoomEvent('trackSubscribed', track));
    track.detach.mockClear();

    act(() => emitRoomEvent('reconnecting'));

    expect(track.detach).toHaveBeenCalled();
  });

  it.each([false, true])('surfaces and clears a reconnecting state (Open rounds: %s)', async openRounds => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
      open_rounds: openRounds ? openRoundsListening().open_rounds : undefined,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());

    act(() => emitRoomEvent('reconnecting'));
    expect(screen.getByText('Reconnecting to the debate room…')).toBeInTheDocument();
    if (openRounds) {
      expect(screen.getByText('Reconnecting to the debate room…').closest('[role="status"]')).toHaveAttribute(
        'data-room-notice',
        'connection'
      );
    }

    act(() => emitRoomEvent('reconnected'));
    await waitFor(() => expect(screen.queryByText('Reconnecting to the debate room…')).not.toBeInTheDocument());
  });

  it.each([false, true])(
    'asks for a click when the browser blocks the opponent’s audio (Open rounds: %s)',
    async openRounds => {
      mocks.debate = {
        ...readyDebate({ localReady: true, remoteReady: true }),
        status: 'connecting',
        connecting_started_at: '2099-07-02T00:00:00.000Z',
        connecting_deadline_at: '2099-07-02T00:00:10.000Z',
        open_rounds: openRounds ? openRoundsListening().open_rounds : undefined,
      };

      render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
      expect(screen.queryByText('Audio is blocked')).not.toBeInTheDocument();

      mocks.roomCanPlaybackAudio = false;
      act(() => emitRoomEvent('audioPlaybackChanged', false));
      fireEvent.click(await screen.findByRole('button', { name: 'Enable audio' }));
      expect(mocks.roomStartAudio).toHaveBeenCalled();

      mocks.roomCanPlaybackAudio = true;
      act(() => emitRoomEvent('audioPlaybackChanged', true));
      await waitFor(() => expect(screen.queryByText('Audio is blocked')).not.toBeInTheDocument());
    }
  );

  it('keeps the speaker off when enabling blocked audio unmutes the elements', async () => {
    // The room's speaker toggle sits behind the debugging flag.
    mocks.featureFlags.debateDebugging = true;
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'connecting',
      connecting_started_at: '2099-07-02T00:00:00.000Z',
      connecting_deadline_at: '2099-07-02T00:00:10.000Z',
    };
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
    const remoteAudio = document.createElement('audio');
    act(() => emitRoomEvent('trackSubscribed', { kind: 'audio', attach: () => remoteAudio, detach: () => [] }));

    fireEvent.click(screen.getByRole('button', { name: 'Turn speaker off' }));
    expect(remoteAudio.muted).toBe(true);
    // As LiveKit's does: every remote audio element is unmuted and played.
    mocks.roomStartAudio.mockImplementation(async () => {
      remoteAudio.muted = false;
    });
    mocks.roomCanPlaybackAudio = false;
    act(() => emitRoomEvent('audioPlaybackChanged', false));
    const notice = (await screen.findByText('Audio is blocked')).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(notice).getByRole('button', { name: 'Enable audio' }));

    await waitFor(() => expect(mocks.roomStartAudio).toHaveBeenCalled());
    await waitFor(() => expect(remoteAudio.muted).toBe(true));
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
    setDocumentVisibility('hidden');
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
      await mocks.ownershipTakeoverHandler?.({ requesterPriority: 2, ownerPriority: 2, automatic: false });
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
    // The claim is set exactly as the intro screen sets it — wide band, `text-mainPage` on desktop
    // — so the headline does not resize under you at the swap. Only the video column is still held
    // to the room's 430px, which is what `main` used to hold everything to.
    expect(heading).toHaveClass('mb-5', 'max-w-[900px]', 'text-mainPage', 'md:max-w-[390px]', 'md:text-[1.5rem]');
    expect(debateVideoTile('local').parentElement).toHaveClass('max-w-[430px]');
    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn camera off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn speaker off' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Turn speaker off' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Turn speaker off' }));

    await waitFor(() => expect(remoteVideo.muted).toBe(true));
    expectDebateVideoTileInColor('remote');
  });

  // The pill is driven by the recorder's own `start` event rather than by the debate status, so
  // what it claims and what is being written to disk cannot drift apart.
  it('flips the recording pill when the recorder actually starts', async () => {
    installRecordingMocks();

    await renderLiveDebate();

    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    expect(await screen.findByText('Recording')).toBeInTheDocument();
    expect(screen.queryByText('Not recording')).not.toBeInTheDocument();
  });

  // It is the local `MediaRecorder` this reports on, so it belongs to the local tile and to no
  // other. It used to be `fixed` to the top of the viewport, far from either.
  it('puts the recording pill in the local tile rather than over the screen', async () => {
    installRecordingMocks();

    await renderLiveDebate();

    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    await waitFor(() => expect(within(debateVideoTile('local')).getByText('Recording')).toBeInTheDocument());
    expect(within(debateVideoTile('remote')).queryByText('Recording')).not.toBeInTheDocument();
  });

  // A recorder can end without `stopLocalRecorder`: a disconnect stops the local tracks, the
  // stream goes inactive and it stops itself. `capturing` outlives the modal, so it has to be
  // cleared from the recorder's own events.
  it('clears the recording pill when the recorder stops on its own', async () => {
    const recorders = installRecordingMocks();

    await renderLiveDebate();

    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    expect(await screen.findByText('Recording')).toBeInTheDocument();

    act(() => {
      recorders[0]?.dispatchEvent(new Event('stop'));
    });

    expect(await screen.findByText('Not recording')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('clears the recording pill when the recorder errors', async () => {
    const recorders = installRecordingMocks();

    await renderLiveDebate();

    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    expect(await screen.findByText('Recording')).toBeInTheDocument();

    act(() => {
      recorders[0]?.dispatchEvent(new Event('error'));
    });

    expect(await screen.findByText('Not recording')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('records the published tracks by default without waiting for experimental input playback', async () => {
    mocks.recordingInputReady = new Promise<void>(() => {});
    installRecordingMocks();
    await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
    expect(mocks.recordingInputCreated).not.toHaveBeenCalled();
    expect(mocks.capturingMutateAsync).toHaveBeenCalled();
    const stream = mocks.mediaRecorderConstruct.mock.calls[0]?.[0] as MediaStream;
    expect(stream.getAudioTracks()[0]).toMatchObject({ id: 'krisp-processed-audio' });
    expect(stream.getVideoTracks()).toHaveLength(1);
  });

  it('does not announce recording until its stable media input is ready', async () => {
    mocks.featureFlags.debateDeviceSwitchRecording = true;
    const ready = deferred<void>();
    mocks.recordingInputReady = ready.promise;
    installRecordingMocks();
    await renderLiveDebate();
    await waitFor(() => expect(mocks.recordingInputCreated).toHaveBeenCalledOnce());
    expect(mocks.mediaRecorderConstruct).not.toHaveBeenCalled();
    expect(mocks.capturingMutateAsync).not.toHaveBeenCalled();
    await act(async () => ready.resolve());
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
    expect(mocks.capturingMutateAsync).toHaveBeenCalled();
  });

  it('cancels a pending recording startup when the room unmounts', async () => {
    mocks.featureFlags.debateDeviceSwitchRecording = true;
    const ready = deferred<void>();
    mocks.recordingInputReady = ready.promise;
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.recordingInputCreated).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => ready.resolve());
    expect(mocks.mediaRecorderConstruct).not.toHaveBeenCalled();
    expect(mocks.capturingMutateAsync).not.toHaveBeenCalled();
  });

  it('reports a recording input failure after a device change instead of silently recording black or silence', async () => {
    mocks.featureFlags.debateDeviceSwitchRecording = true;
    installRecordingMocks();
    await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
    mocks.recordingInputUpdate.mockRejectedValueOnce(new Error('Playback blocked'));
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-2', groupId: 'mic-group-2', label: 'Studio Mic' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
    ]);
    await act(async () => mocks.deviceChangeHandler?.());
    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        'debate_recorder_failed',
        expect.objectContaining({ stage: 'runtime', error_message: 'Playback blocked' })
      )
    );
    expect(await screen.findByText('Not recording')).toBeInTheDocument();
    expect(mocks.recordingInputStop).toHaveBeenCalled();
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

  it('measures a recording on the clock it started on when a clock retry lands mid-capture (GEO-3407)', async () => {
    installRecordingMocks();
    // The first sync fails, so capture starts on this computer's clock (frozen at 00:00:20)...
    mocks.getServerTime.mockRejectedValue(new Error('offline'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
    // ...then a retry succeeds against a server ten seconds ahead of it.
    mocks.getServerTime.mockImplementation(() => Promise.resolve({ server_time_ms: Date.now() + 10_000 }));
    await waitFor(() => expect(mocks.getServerTime).toHaveBeenCalledTimes(6), { timeout: 4_000 });
    await act(async () => undefined);

    mocks.debate = completedDebateOutsideThankYou();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    const recording = mocks.enqueueRecording.mock.calls[0]?.[0];
    // No time passed on the frozen clock, so not the ten seconds the correction would add.
    expect(recording.endedAtMs - recording.startedAtMs).toBe(0);
    expect(recording.durationSeconds).toBe(1);
  });

  it('hides debate controls while the terminal recording is being saved', async () => {
    const persistence = deferred<void>();
    mocks.featureFlags.debateDebugging = true;
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    const noiseFilterSwitch = await screen.findByRole('switch', { name: 'Krisp noise filter' });
    await waitFor(() => expect(noiseFilterSwitch).toBeEnabled());

    mocks.debate = completedDebateOutsideThankYou();
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

  it('starts capturing during preflight rather than waiting for the recording window to open', async () => {
    // GEO-2644. The recorder used to be scheduled for `startAtMs`, so the encoder's own warmup
    // happened at t=0 and every recording began fractionally after the window it is measured
    // against. Capture has to be running *before* the window opens; the server trims the
    // pre-window head, so starting early costs nothing and padding the head is what it avoids.
    installRecordingMocks();
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      current_turn_index: 0,
      current_speaker_slot: null,
      started_at: null,
      // Ten seconds after the synchronized clock, so the window is still firmly shut.
      preflight_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
    // Recording, but the debate has not started — nothing is uploaded until the window closes.
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
    rememberDebateReturnDestination('/space/my-space/claims#recent');
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
    expect(mocks.replace).toHaveBeenCalledWith('/space/my-space/claims#recent');
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

  // GEO-3406: press between clock ticks, then replace the optimistic yield with the real row.
  // Observe every track write: checking only the settled DOM misses a mic that reopened briefly.
  it.each([0, 6_000].flatMap(responseDelayMs => ([1, 2] as const).map(slot => ({ slot, responseDelayMs }))))(
    'never reopens slot $slot’s yielded mic with a $responseDelayMs ms response delay',
    async ({ slot, responseDelayMs }) => {
      vi.useFakeTimers();
      vi.setSystemTime(openRoundsAt('20:02:20.000'));
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      if (slot === 2) joinAsBob();
      const pendingEnd = deferred<Debate>();
      const enabledWrites: boolean[] = [];
      const audioTrack = createLocalAudioTrack();
      const processedTrack = { kind: 'audio', enabled: true, id: 'krisp-processed-audio' };
      for (const track of [audioTrack.sourceMediaStreamTrack, processedTrack]) {
        let enabled = true;
        Object.defineProperty(track, 'enabled', {
          get() {
            return enabled;
          },
          set(value: boolean) {
            enabled = value;
            enabledWrites.push(value);
          },
        });
      }
      mocks.krispNoiseFilter.mockReturnValue({
        processedTrack,
        setEnabled: mocks.krispSetEnabled,
        isEnabled: mocks.krispIsEnabled,
        destroy: mocks.krispDestroy,
      });
      const enabledAtRequest: boolean[] = [];
      mocks.endTurnMutateAsync.mockImplementation(() => {
        enabledAtRequest.push(audioTrack.sourceMediaStreamTrack.enabled, processedTrack.enabled);
        return pendingEnd.promise;
      });
      mocks.createLocalTracks.mockResolvedValue([
        audioTrack,
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ]);
      // If the turn were incorrectly handed back and then left again, ongoing speech would allow
      // the buzzer overrun to keep the microphone live for another three seconds.
      mocks.localSpeaking = { current: true };
      mocks.debate = {
        ...openRoundsRoundOneSpeaking(),
        first_participant_slot: slot,
        current_speaker_slot: slot,
      };
      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await act(async () => {
        await vi.waitFor(() => expect(audioTrack.setProcessor).toHaveBeenCalledOnce());
      });
      expect(processedTrack.enabled).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(200));
      fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
      const { endedAtMs } = mocks.endTurnMutateAsync.mock.calls[0]![0];
      expect(enabledAtRequest).toEqual([false, false]);
      expect(processedTrack.enabled).toBe(false);
      enabledWrites.length = 0;
      await act(() => vi.advanceTimersByTimeAsync(responseDelayMs));
      expect(processedTrack.enabled).toBe(false);

      const acceptedAtMs = Date.now();
      const yielded: Debate = {
        ...mocks.debate!,
        turn_yields: [
          {
            turn_index: 2,
            user_id: mocks.currentUserId,
            participant_slot: slot,
            yielded_at: new Date(endedAtMs).toISOString(),
            accepted_at: new Date(acceptedAtMs).toISOString(),
            handoff_deadline_at: new Date(acceptedAtMs + 5_000).toISOString(),
          },
        ],
      };
      mocks.debate = yielded;
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await act(async () => pendingEnd.resolve(yielded));

      expect(screen.queryByRole('button', { name: 'End turn' })).not.toBeInTheDocument();
      expect(debateVideoTile('local')).toHaveAttribute('data-active-speaker', 'false');
      expect(debateVideoTile('local').querySelector('[data-turn-timer]')).toBeNull();
      expect(enabledWrites).not.toContain(true);
      await act(() => vi.advanceTimersByTimeAsync(5_500));
      expectMutedIndicator('local');
      expect(processedTrack.enabled).toBe(false);
      expect(enabledWrites).not.toContain(true);
    }
  );

  it('opens both mics for the pick immediately after confirming the last turn yield', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(openRoundsAt('20:03:10.000'));
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    joinAsBob();
    const pendingEnd = deferred<Debate>();
    mocks.endTurnMutateAsync.mockReturnValue(pendingEnd.promise);
    const audioTrack = createLocalAudioTrack();
    mocks.krispSupported.mockReturnValue(false);
    mocks.createLocalTracks.mockResolvedValue([audioTrack]);
    mocks.debate = {
      ...openRoundsRoundOneSpeaking(),
      current_turn_index: 3,
      current_speaker_slot: 2,
      turn_started_at: '2026-10-06T20:02:52.200Z',
      turn_ends_at: '2026-10-06T20:03:37.200Z',
    };
    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      await vi.waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledOnce());
    });
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(200));
    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
    const { endedAtMs } = mocks.endTurnMutateAsync.mock.calls[0]![0];
    const endedAt = new Date(endedAtMs).toISOString();
    mocks.debate = {
      ...mocks.debate!,
      turn_yields: [
        {
          turn_index: 3,
          user_id: 'user-b',
          participant_slot: 2,
          yielded_at: endedAt,
          accepted_at: endedAt,
          handoff_deadline_at: endedAt,
        },
      ],
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => pendingEnd.resolve(mocks.debate!));

    expect(document.querySelector('[data-open-round-pick-card]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).not.toBeInTheDocument();
    expectNoMutedIndicator('local');
    expectNoMutedIndicator('remote');
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);
  });

  it('restores the mic and allows retry when End turn fails without committing a yield', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(openRoundsAt('20:02:20.000'));
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    const pendingEnd = deferred<Debate>();
    mocks.endTurnMutateAsync.mockReturnValue(pendingEnd.promise);
    const audioTrack = createLocalAudioTrack();
    mocks.krispSupported.mockReturnValue(false);
    mocks.createLocalTracks.mockResolvedValue([audioTrack]);
    mocks.debate = openRoundsRoundOneSpeaking();
    mocks.refetchDebate.mockResolvedValue({ data: mocks.debate });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      await vi.waitFor(() => expect(mocks.publishTrack).toHaveBeenCalledOnce());
    });
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
    await act(async () => pendingEnd.reject(new Error('Could not end the turn.')));

    expect(mocks.refetchDebate).toHaveBeenCalledOnce();
    expect(screen.getByText('Could not end the turn.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End turn' })).toBeEnabled();
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);
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

    await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
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
    // A fixed format keeps today's timer, without the Open rounds build-up (GEO-3315).
    expect(document.querySelector('[data-turn-timer]')).not.toBeInTheDocument();
    expect(debateVideoTile('local')).toHaveClass('outline-purple');
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

  // GEO-2773. The publish opt-out used to be a Cancel button on a bar at the bottom of the screen;
  // it is a switch on the thank-you card now. The behaviour behind it is deliberately unchanged,
  // so the switch opens the coordinator's confirmation rather than cancelling on the spot.
  function thankingDebateAtFinalTurn() {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.500Z'));
    mocks.createLocalTracks.mockResolvedValue([
      { mediaStreamTrack: { kind: 'audio', enabled: false }, stop: vi.fn(), detach: vi.fn() },
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
  }

  // The card lives inside the recording modal, which the room drops when the connection goes idle.
  // Telling the coordinator the card is carrying the control while it isn't rendered leaves the
  // viewer with neither: no switch here, and a banner that has stood down for this debate.
  it('does not claim to carry the publish control once the room has gone idle', async () => {
    thankingDebateAtFinalTurn();
    mocks.publishOptOutOffer = { debateId: 'debate-1', busy: false, cancelled: false };
    // An ownership conflict, which is what drops the room to idle mid-countdown.
    mocks.ownershipAcquire.mockResolvedValue({ acquired: false, waitedForLocalRelease: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await screen.findByText('This debate is already open in another tab.');
    expect(screen.queryByRole('switch', { name: 'Publish debate' })).toBeNull();

    // So the banner has to keep speaking for it.
    const published = mocks.setThankingDebate.mock.calls.at(-1)?.[0];
    expect(published?.showsPublishControl ?? false).toBe(false);
  });

  // GEO-3301. The publish control moved to the claim picker. For the moment the room is still up
  // after the last turn, the banner's Cancel is the way out, so the room never claims it.
  it('leaves the publish control to the claim picker and, until then, the banner', async () => {
    thankingDebateAtFinalTurn();
    mocks.publishOptOutOffer = { debateId: 'debate-1', busy: false, cancelled: false };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
    expect(screen.queryByRole('switch', { name: 'Publish debate' })).toBeNull();
    expect(screen.queryByText('Publish debate?')).toBeNull();
    await waitFor(() =>
      expect(mocks.setThankingDebate).toHaveBeenCalledWith(expect.objectContaining({ debateId: 'debate-1' }))
    );
    expect(mocks.setThankingDebate.mock.calls.every(([published]) => !published?.showsPublishControl)).toBe(true);
  });

  // GEO-3180. How far the two took it leads the card, above publish and rematch.
  function thankingOpenRoundsDebate(rebuttalRounds: number): Debate {
    vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:30.000'));
    const thanking = openRoundsThankingAfterEnd();
    const rebuttalTurns = rebuttalRounds * 2;
    return {
      ...thanking,
      turn_durations_ms: [60_000, 60_000, ...Array.from({ length: rebuttalTurns }, () => 45_000)],
      open_rounds: {
        ...thanking.open_rounds!,
        turn_roles: ['opening', 'opening', ...Array.from({ length: rebuttalTurns }, () => 'rebuttal' as const)],
      },
    };
  }

  // GEO-3301. No end card: the rounds the two unlocked, a publish row, a way back to a lobby and
  // "Debate again?" all went, and the room hides itself until the picker takes over.
  it('hides the room between the last turn and the picker, whatever the format', async () => {
    mocks.debate = thankingOpenRoundsDebate(2);

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
    expect(screen.queryByText(/Opening only|Debate again|Publish debate/)).toBeNull();
  });

  // GEO-3301. Nothing refreshes the debate as its last turn ends, so a room that waited for the
  // payload to say `thanking`, and for the session it names, sat on a blank screen (Preston saw
  // "Opening claims..." on the preview). Consent needs only the debate.
  it('consents on its own clock, before the debate payload or the session catch up', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:20.500Z'));
    mocks.rematch = null;
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
      rematch_session_id: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.refetchDebate).not.toHaveBeenCalled();
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

    await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
    expect(screen.queryByRole('button', { name: "Let's go!" })).toBeNull();
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

    expect(document.querySelector('main.invisible')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(101));
    expect(recordingSurface()).toHaveClass('invisible');
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

  // GEO-3301. Nobody is asked: the room consents for its viewer the moment the debate ends, and
  // shows nothing while both rooms do, so the debate goes straight to the picker.
  it('consents as soon as the debate ends, with nothing on screen while it does', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:21.000Z'));
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

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
    expect(recordingSurface()).toHaveClass('invisible');
    expect(screen.queryByText('Waiting for Bri...')).toBeNull();
    expect(screen.queryByRole('button', { name: "Let's go!" })).toBeNull();
  });

  // A blank screen is only right while the handoff is quick. Past it the other room is likely gone,
  // so the viewer is told who the room is waiting on and keeps a way out.
  it.each([false, true])('keeps a labelled exit during a slow handoff (from lobby: %s)', async fromLobby => {
    if (fromLobby) rememberLobbyReturnDestination('lobby-1');
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:24.000Z'));
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
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const notice = (await screen.findByText('Waiting for Bri...')).closest('[role="status"]')!;
    fireEvent.click(within(notice as HTMLElement).getByRole('button', { name: fromLobby ? 'Back to lobby' : 'Leave' }));
    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    if (fromLobby) await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/debate/lobby-1'));
  });

  it('automatically consents shortly before the thank-you countdown ends', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:35.100Z'));
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

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
  });

  it('automatically consents when the debate completes before the thank-you deadline', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:35.100Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:35.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
  });

  // GEO-3301. Both rooms consent as soon as the debate ends, so a live session is the signal to go,
  // with whatever is left of the thank-you deadline.
  it('leaves a connected early-complete rematch for the picker without waiting out the deadline', async () => {
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    installRecordingMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:35.100Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:35.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // No tick is advanced: the clock is still inside the thank-you period.
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();
  });

  it('redirects an idle room as soon as both rooms have consented', async () => {
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // Fifteen seconds left. No tick is advanced here: the redirect has to come from the session, not
    // from the clock running out.
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it.each(['input failure', 'browser stop'])(
    'does not save a recorder stopped by %s until final events',
    async cause => {
      mocks.featureFlags.debateDeviceSwitchRecording = true;
      setHistoryLength(2);
      const recorders = installRecordingMocks();
      vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalledOnce());
      const recorder = recorders[0] as EventTarget & {
        state: RecordingState;
        stop: () => void;
        ondataavailable: ((event: BlobEvent) => void) | null;
      };
      recorder.stop = () => {
        recorder.state = 'inactive';
      };
      if (cause === 'input failure') {
        mocks.recordingInputUpdate.mockRejectedValueOnce(new Error('Input playback failed'));
        mocks.enumerateDevices.mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-2', groupId: 'mic-group-2', label: 'Studio Mic' },
          { kind: 'videoinput', deviceId: 'camera-1', groupId: 'camera-group-1', label: 'HD Pro Webcam' },
        ]);
        await act(async () => mocks.deviceChangeHandler?.());
        await waitFor(() => expect(recorder.state).toBe('inactive'));
      } else {
        recorder.state = 'inactive';
        act(() => recorder.dispatchEvent(new Event('error')));
      }
      mocks.getRecording.mockClear();
      mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
      mocks.rematch = rematchSession('ended', { localConsented: true, remoteConsented: false });
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
      await waitFor(() => expect(mocks.getRecording).toHaveBeenCalled());
      expect(mocks.enqueueRecording).not.toHaveBeenCalled();
      expect(mocks.back).not.toHaveBeenCalled();
      const finalChunk = new Blob(['final chunk']);
      act(() => {
        recorder.ondataavailable?.({ data: finalChunk } as BlobEvent);
        recorder.dispatchEvent(new Event('stop'));
      });
      await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
      expect(mocks.enqueueRecording.mock.calls[0]?.[0]?.recording.size).toBe(finalChunk.size);
      expect(mocks.liveStreamAppend).toHaveBeenCalledWith(finalChunk, expect.any(Number));
      await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    }
  );

  it('waits for a disconnect stop to deliver its final chunks before saving on completion', async () => {
    setHistoryLength(2);
    const recorders = installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    const recorder = recorders[0] as EventTarget & {
      state: RecordingState;
      stop: () => void;
      ondataavailable: ((event: BlobEvent) => void) | null;
    };
    recorder.stop = () => {
      recorder.state = 'inactive';
    };
    act(() => emitRoomEvent('disconnected', 99));
    mocks.getRecording.mockClear();
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = rematchSession('ended', { localConsented: true, remoteConsented: false });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.getRecording).toHaveBeenCalled());
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['final chunk']) } as BlobEvent);
      recorder.dispatchEvent(new Event('stop'));
    });
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
  });

  // Copilot on #2853: a dropped call tears the room down without saving, so a tab that held it can
  // be idle and still hold what it recorded. Either way out of the room saves that first.
  it.each([
    ['goes back when the session ended', 'ended' as const],
    ['follows a live session to the picker', 'browsing' as const],
  ])('saves what a dropped call left it holding before it %s', async (_label, status) => {
    setHistoryLength(2);
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    // The call drops mid-debate, before the room ever reaches the save.
    act(() => emitRoomEvent('disconnected', 99));
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession(status, { localConsented: true, remoteConsented: status === 'browsing' });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const left = status === 'ended' ? mocks.back : mocks.replace;
    await waitFor(() => expect(left).toHaveBeenCalled());
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();
    expect(mocks.enqueueRecording.mock.invocationCallOrder[0]).toBeLessThan(left.mock.invocationCallOrder[0]!);
  });

  // Copilot on #2853: a failed save on an idle tab's way out stranded it, with Retry save locked
  // behind "transitioning" on a live session and the room not drawn at all on an ended one.
  it.each([
    ['going back on an ended session', 'ended' as const],
    ['following a live session to the picker', 'browsing' as const],
  ])('offers a working Retry save when that save fails, then finishes %s', async (_label, status) => {
    setHistoryLength(2);
    mocks.enqueueRecording.mockRejectedValueOnce(new Error('Storage unavailable'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    act(() => emitRoomEvent('disconnected', 99));

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession(status, { localConsented: true, remoteConsented: status === 'browsing' });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const retry = await screen.findByRole('button', { name: 'Retry save' });
    expect(retry).toBeEnabled();
    expect(screen.getAllByText('Storage unavailable')).not.toHaveLength(0);
    // Held, not looping: one attempt until the viewer asks again.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();

    fireEvent.click(retry);

    const left = status === 'ended' ? mocks.back : mocks.replace;
    await waitFor(() => expect(left).toHaveBeenCalled());
    expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2);
  });

  // Copilot on #2853: Leave skipped the save for any idle room, so pressing it from the save-error
  // state threw away the recording Retry save was holding on to. The live-session case is the one
  // that broke; the ended one goes through the finalizer, which already saved, and is kept so the
  // two ways out stay covered together.
  it.each([
    ['a live session', 'browsing' as const],
    ['an ended session', 'ended' as const],
  ])('saves the held recording when Leave is pressed after a failed save, with %s', async (_label, status) => {
    setHistoryLength(2);
    mocks.enqueueRecording.mockRejectedValueOnce(new Error('Storage unavailable'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    act(() => emitRoomEvent('disconnected', 99));

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession(status, { localConsented: true, remoteConsented: status === 'browsing' });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await screen.findByRole('button', { name: 'Retry save' });

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueRecording.mock.invocationCallOrder[1]).toBeLessThan(mocks.back.mock.invocationCallOrder[0]!);
  });

  // Copilot on #2853: Leave on a debate still thanking, with the session ended, fell through to the
  // mid-debate branch, which discards the recording and aborts the debate.
  it('saves rather than aborts when Leave follows a failed save on an ended session, still thanking', async () => {
    setHistoryLength(2);
    mocks.enqueueRecording.mockRejectedValueOnce(new Error('Storage unavailable'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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
    mocks.rematch = rematchSession('ended', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await screen.findByRole('button', { name: 'Retry save' });

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2);
    expect(mocks.abortMutateAsync).not.toHaveBeenCalled();
  });

  // Copilot on #2853: an idle tab's way to the picker ran on after its save even when Leave had
  // been pressed while the save was pending, so the picker overrode the viewer's choice.
  it('lets Leave pressed during an idle tab’s pending save win over the move to the picker', async () => {
    setHistoryLength(2);
    const persistence = deferred<void>();
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    act(() => emitRoomEvent('disconnected', 99));

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());

    // The dropped call keeps the room up to say so, with its own Leave.
    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    await act(async () => {
      persistence.resolve();
      await persistence.promise;
    });

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    // The move to the picker claims the next step asynchronously; give it time to land if it ran.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  // Shared by the dropped-call cases below: the tab records, the call drops mid-debate, and the
  // debate ends on the server with a session in `status`.
  async function dropCallThenEndDebate(status: DebateRematchSession['status']) {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:15.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    act(() => emitRoomEvent('disconnected', 99));
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession(status, { localConsented: true, remoteConsented: status === 'browsing' });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    return view;
  }

  // Copilot on #2853: the session ending while an idle tab saved on its way to the picker started a
  // second exit against the same save, and both navigated, the older one to the ended picker.
  it('takes only the newest idle exit when the session ends during the save', async () => {
    setHistoryLength(2);
    const persistence = deferred<void>();
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    const view = await dropCallThenEndDebate('browsing');
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());

    mocks.rematch = rematchSession('ended', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      persistence.resolve();
      await persistence.promise;
    });

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  // Copilot on #2853: after the automatic save and then Leave's both failed, Retry save re-ran the
  // automatic exit, which stands down once Leave is asked for, so the tab stayed put.
  it('finishes Leave from Retry save after both the automatic save and Leave’s failed', async () => {
    setHistoryLength(2);
    mocks.enqueueRecording
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockRejectedValueOnce(new Error('Storage unavailable'));
    await dropCallThenEndDebate('browsing');
    await screen.findByRole('button', { name: 'Retry save' });

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    expect(mocks.back).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry save' }));

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalledTimes(3);
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  // Copilot on #2853: a Leave that failed before its opt-out landed left the leave-requested flag
  // set, and once the session closed the finalizer refused every way out, Leave included.
  it('still leaves after a failed Leave once the session has closed', async () => {
    setHistoryLength(2);
    mocks.leaveRematchMutateAsync.mockRejectedValueOnce(new Error('Could not leave the rematch.'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    expect(await screen.findAllByText('Could not leave the rematch.')).not.toHaveLength(0);

    mocks.rematch = rematchSession('ended', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalled();
    expect(mocks.abortMutateAsync).not.toHaveBeenCalled();
  });

  // Copilot on #2853: a tab that never held the call (reloaded, or another tab had the room) has no
  // recording to save, so finalizing there failed for good and stranded it on a save error.
  it('sends an idle tab back when the session ended, without trying to save a recording', async () => {
    setHistoryLength(2);
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    mocks.debate = {
      ...completedDebate(),
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: '2026-07-02T00:00:25.000Z',
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('ended', { localConsented: true });
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(screen.queryByText('No local recording was available to save.')).toBeNull();
  });

  // GEO-3301. The room is hidden through the handoff, so an ended session must not leave the
  // viewer on a blank screen for the rest of the thank-you period.
  it('goes back as soon as the other debater ends the session, mid-countdown', async () => {
    setHistoryLength(2);
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));

    // Fifteen seconds still on the clock when the other debater walks out.
    mocks.rematch = rematchSession('ended', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  it('enters the rematch browser as soon as the other room consents, mid-countdown', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');

    // The other room consents too, with fifteen seconds still on the clock.
    mocks.debate = { ...mocks.debate, status: 'complete', completed_at: '2026-07-02T00:00:26.000Z' };
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    expect(mocks.enqueueRecording).toHaveBeenCalledOnce();
  });

  // Copilot on #2853: an ended session's early exit failing its save left Retry save on the
  // save-only branch, so a retry that worked still never left the hidden room.
  it('finishes the exit from Retry save after an ended session’s first persist failed', async () => {
    setHistoryLength(2);
    mocks.enqueueRecording.mockRejectedValueOnce(new Error('Could not save the local recording.'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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
    mocks.rematch = rematchSession('ended', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const retry = await screen.findByRole('button', { name: 'Retry save' });
    expect(mocks.back).not.toHaveBeenCalled();

    fireEvent.click(retry);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
  });

  it('finishes the early rematch exit from Retry save when the first persist failed', async () => {
    mocks.enqueueRecording.mockRejectedValueOnce(new Error('Could not save the local recording.'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      // The debate query still lags the rematch session, which is the snapshot that used to send
      // this retry down the save-only branch and strand the room for good.
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    // The early exit ran and its save failed, so nothing has navigated yet.
    const retry = await screen.findByRole('button', { name: 'Retry save' });
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');

    fireEvent.click(retry);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('does not carry rematch consent state into a subsequent debate route', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:35.100Z'));
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
    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());

    mocks.debate = {
      ...mocks.debate,
      id: 'debate-2',
      rematch_session_id: 'rematch-2',
    };
    mocks.rematch = {
      ...rematchSession('deciding'),
      id: 'rematch-2',
      source_debate_id: 'debate-2',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-2" />);

    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledTimes(2));
  });

  // The room consents the moment the last turn ends (GEO-3301), so the one window left between
  // Leave and consent is a refused attempt waiting for its retry on the next second. Leave closes it.
  function thankingWithRefusedConsent() {
    mocks.consentMutateAsync.mockRejectedValueOnce(
      new GeoChatRequestError('the rematch decision phase has not started', 'rematch_not_ready', 400)
    );
    return {
      ...completedDebate(),
      status: 'thanking' as const,
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
  }

  it('preserves the rematch opt-out when leaving fails before a refused consent is retried', async () => {
    mocks.enqueueRecording.mockRejectedValue(new Error('Storage unavailable'));
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = thankingWithRefusedConsent();
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    expect(await screen.findAllByText('Storage unavailable')).not.toHaveLength(0);

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:26.100Z'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });

    expect(mocks.consentMutateAsync).toHaveBeenCalledOnce();
  });

  it('publishes an existing rematch opt-out before waiting for recording persistence', async () => {
    const leaveRequest = deferred<void>();
    const persistence = deferred<void>();
    setHistoryLength(2);
    mocks.leaveRematchMutateAsync.mockReturnValue(leaveRequest.promise);
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
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
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.back).not.toHaveBeenCalled();

    leaveRequest.resolve();
    persistence.resolve();
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
  });

  it('publishes an opt-out after an in-flight rematch consent succeeds', async () => {
    const consentRequest = deferred<DebateRematchSession>();
    const persistence = deferred<void>();
    mocks.consentMutateAsync.mockReturnValue(consentRequest.promise);
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:35.100Z'));
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
    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();

    consentRequest.resolve(rematchSession('deciding', { localConsented: true }));

    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    persistence.resolve();
  });

  it('does not finalize into the rematch after an already-consented leave fails', async () => {
    mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    mocks.leaveRematchMutateAsync.mockRejectedValue(new Error('Could not leave the rematch.'));
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:25.000Z'));
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
    // This room has consented on its own; the other has not yet.
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    expect(await screen.findAllByText('Could not leave the rematch.')).not.toHaveLength(0);

    // The other room's consent lands after the viewer asked to go.
    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550));
    });

    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  it('does not follow an idle rematch redirect after an explicit leave fails', async () => {
    mocks.leaveRematchMutateAsync.mockRejectedValue(new Error('Could not leave the rematch.'));
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
    // A live session leaves for the picker by itself, so the viewer can only still be here to
    // leave while the other room has yet to consent.
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    expect(await screen.findAllByText('Could not leave the rematch.')).not.toHaveLength(0);

    mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
    act(() => emitRoomEvent('disconnected', 99));
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
  });

  it('retries recording persistence after an already-published opt-out', async () => {
    const firstPersistence = deferred<void>();
    setHistoryLength(2);
    mocks.enqueueRecording.mockReturnValueOnce(firstPersistence.promise).mockResolvedValueOnce(undefined);
    mocks.leaveRematchMutateAsync.mockResolvedValue(undefined);
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
    mocks.rematch = rematchSession('deciding', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));
    await waitFor(() => expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce());
    await act(async () => {
      firstPersistence.reject(new Error('Storage unavailable'));
    });
    expect(await screen.findAllByText('Storage unavailable')).not.toHaveLength(0);

    mocks.rematch = rematchSession('ended', { localConsented: true });
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    expect(mocks.leaveRematchMutateAsync).toHaveBeenCalledOnce();
    expect(mocks.abortMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
  });

  it('enters the rematch browser at the thank-you deadline without waiting for a debate refresh', async () => {
    installRecordingMocks();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:00:40.100Z'));
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
    mocks.rematch = rematchSession('browsing');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(mocks.routePrefetch).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
    expect(mocks.prefetchRematchClaims).toHaveBeenLastCalledWith('rematch-1', [], true);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
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
    mocks.debate = { ...completedDebateOutsideThankYou(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalled());
    expect(mocks.enqueueRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        debateId: 'debate-1',
        recording: expect.objectContaining({ size: expect.any(Number), availableFrom: 0 }),
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

    mocks.debate = completedDebateOutsideThankYou();
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

  describe('streaming the recording while it is made (GEO-2955)', () => {
    const multipart = {
      filename: 'recordings/debate-1/slot-1/user-a/1.local.webm',
      uploadId: 'upload-1',
      partSize: 5 * 1024 * 1024,
      uploadedPartNumbers: [1, 2],
    };

    it('streams every timeslice and hands what went out live to the upload queue', async () => {
      mocks.liveStreamFinish.mockResolvedValue(multipart);
      setHistoryLength(2);
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      expect(mocks.startLiveStream).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^user-a:debate-1:\d+$/),
          metadata: expect.objectContaining({ userId: 'user-a', debateId: 'debate-1', mimeType: 'video/webm' }),
        })
      );

      mocks.debate = completedDebateOutsideThankYou();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
      // The final timeslice reached the stream as well as the in-memory copy.
      expect(mocks.liveStreamAppend).toHaveBeenCalledWith(expect.any(Blob), expect.any(Number));
      expect(mocks.enqueueRecording).toHaveBeenCalledWith(expect.objectContaining({ multipart }));
      // Once the queue holds the recording, the chunks saved as it was made are released.
      await waitFor(() => expect(mocks.liveStreamRelease).toHaveBeenCalledOnce());
      expect(mocks.liveStreamAbort).not.toHaveBeenCalled();
      expect(mocks.liveStreamDetach).not.toHaveBeenCalled();
    });

    it('queues an ordinary recording when nothing was streamed', async () => {
      setHistoryLength(2);
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      mocks.debate = completedDebateOutsideThankYou();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
      expect(mocks.enqueueRecording).toHaveBeenCalledWith(expect.objectContaining({ multipart: null }));
      // The whole recording is one upload from here: counted, never silent (GEO-3171).
      expect(mocks.capture).toHaveBeenCalledWith(
        'debate_recording_upload_fallback',
        expect.objectContaining({ debate_id: 'debate-1', reason: 'whole_recording_after_debate', streamed: true })
      );
    });

    it('tells the stream why it should stand down, not just whether (GEO-3171)', async () => {
      setHistoryLength(2);
      installRecordingMocks();
      await renderLiveDebate();
      await waitFor(() => expect(mocks.startLiveStream).toHaveBeenCalled());
      const { shouldPause } = mocks.startLiveStream.mock.calls[0][0] as { shouldPause: () => string | null };

      expect(shouldPause()).toBeNull();
      const onLine = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
      try {
        expect(shouldPause()).toBe('offline');
      } finally {
        onLine.mockRestore();
      }
    });

    it('reports a recording that could not be handed to the upload queue (GEO-3171)', async () => {
      mocks.enqueueRecording.mockRejectedValue(new Error('disk said no'));
      setHistoryLength(2);
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      mocks.debate = completedDebateOutsideThankYou();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() =>
        expect(mocks.capture).toHaveBeenCalledWith(
          'debate_recording_upload_failed',
          expect.objectContaining({ debate_id: 'debate-1', stage: 'handoff', terminal_reason: 'handoff_failed' })
        )
      );
    });

    it('discards the streamed parts when the debate is cancelled', async () => {
      setHistoryLength(2);
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      mocks.debate = { ...completedDebate(), status: 'cancelled', completed_at: null };
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() => expect(mocks.liveStreamAbort).toHaveBeenCalledOnce());
      expect(mocks.enqueueRecording).not.toHaveBeenCalled();
      expect(mocks.liveStreamRelease).not.toHaveBeenCalled();
      expect(mocks.liveStreamDetach).not.toHaveBeenCalled();
    });

    it('keeps the saved chunks for recovery when the room unmounts mid-debate', async () => {
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      view.unmount();

      // Stopped but neither discarded nor released: the coordinator decides, once the debate settles.
      expect(mocks.liveStreamDetach).toHaveBeenCalledOnce();
      expect(mocks.liveStreamAbort).not.toHaveBeenCalled();
      expect(mocks.liveStreamRelease).not.toHaveBeenCalled();
    });

    it('stops the live stream when a connection timeout cancels the debate mid-recording', async () => {
      installRecordingMocks();
      const view = await renderLiveDebate();
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      mocks.debate = {
        ...completedDebate(),
        status: 'cancelled',
        cancellation_reason: 'connection_timeout',
        completed_at: null,
      };
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      // A connection timeout goes through the connection-failure path only, which keeps the chunks.
      await waitFor(() => expect(mocks.liveStreamDetach).toHaveBeenCalledOnce());
      expect(mocks.liveStreamAbort).not.toHaveBeenCalled();
      expect(mocks.liveStreamRelease).not.toHaveBeenCalled();
    });
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

    // GEO-2949. The window now runs RECORDING_POST_ROLL_MS past the final turn's deadline, so
    // the last speaker is not cut mid-sentence. Still recording one millisecond after the old
    // cut-off is the whole point of the change.
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:01:10.001Z'));
    mocks.debate = { ...mocks.debate! };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();

    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-02T00:01:15.001Z'));
    mocks.debate = { ...mocks.debate! };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
    expect(mocks.debate.status).toBe('in_progress');
  });

  // GEO-3175. An Open rounds debate has no end until a round resolves End, so the recorder must not
  // stop at the summed turn list, which only ever holds the rounds decided so far.
  describe('open rounds recording (GEO-3175)', () => {
    const publishedThanking = () => mocks.setThankingDebate.mock.calls.some(([value]) => value !== null);

    it('records through every decision and stops a post-roll after thanking starts', async () => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      mocks.liveStreamFinish.mockResolvedValue({
        filename: 'recordings/debate-1/slot-1/user-a/1.local.webm',
        uploadId: 'upload-1',
        partSize: 5 * 1024 * 1024,
        uploadedPartNumbers: [1],
      });
      installRecordingMocks();
      vi.mocked(Date.now).mockReturnValue(openRoundsAt('20:01:30.000'));
      const view = await renderLiveDebate(openRoundsListening());
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      // The opening's summed end plus the post-roll is 20:02:05. A fixed-turn recorder stopped here.
      rerenderAt(view, '20:02:06.000', openRoundsDeciding({ my_pick: 'extend' }));
      rerenderAt(view, '20:02:40.000', openRoundsDeciding({ my_pick: 'extend', opponent_has_picked: true }));
      // Round 0 resolved Extend, and round 1 runs.
      rerenderAt(view, '20:03:00.000', openRoundsRoundOneSpeaking());
      await act(async () => undefined);
      expect(mocks.enqueueRecording).not.toHaveBeenCalled();
      expect(mocks.liveStreamFinish).not.toHaveBeenCalled();
      expect(publishedThanking()).toBe(false);
    });

    it('arms the stop from the row that resolves End, and finishes the live stream only then', async () => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      installRecordingMocks();
      vi.mocked(Date.now).mockReturnValue(openRoundsAt('20:02:03.000'));
      const view = await renderLiveDebate(openRoundsDeciding());
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

      // Resolved End at 20:02:05: thanking from 20:02:08, so the recording ends at 20:02:13.
      rerenderAt(view, '20:02:12.900', openRoundsRevealEnd());
      await act(async () => undefined);
      expect(mocks.enqueueRecording).not.toHaveBeenCalled();
      expect(mocks.liveStreamFinish).not.toHaveBeenCalled();

      rerenderAt(view, '20:02:13.001', openRoundsRevealEnd());
      await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledOnce());
      expect(mocks.liveStreamFinish).toHaveBeenCalledOnce();
    });

    it('does not show thanking when the room reloads during a decision', async () => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      installRecordingMocks();
      // Past the deadline and still unresolved: the room waits for the server, it does not end.
      vi.mocked(Date.now).mockReturnValue(openRoundsAt('20:02:11.000'));
      await renderLiveDebate(openRoundsDeciding({ my_pick: 'end', opponent_has_picked: true }));
      await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
      await act(async () => undefined);

      expect(publishedThanking()).toBe(false);
      expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    });
  });

  // GEO-3174. The room says which round it is in, with Leave at its right, between the claim and
  // the tiles.
  describe('open rounds round indicator (GEO-3174)', () => {
    const indicator = () => document.querySelector('[data-debate-round-indicator]');

    it('follows the room from the opening into round 1, beside Leave between the claim and the tiles', async () => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      const view = await renderLiveDebate(openRoundsListening());

      expect(indicator()).toHaveAttribute('data-debate-round-indicator', '0');
      expect(screen.getByText('Opening. No rebuttal rounds yet. Another round is possible.')).toBeInTheDocument();
      const leave = screen.getByRole('button', { name: 'Leave debate' });
      const heading = screen.getByRole('heading', { name: 'The protocol should ship debates' });
      expect(heading.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(leave.compareDocumentPosition(debateVideoTile('local')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(leave.parentElement).toContainElement(indicator() as HTMLElement);

      vi.mocked(Date.now).mockReturnValue(openRoundsAt('20:03:00.000'));
      mocks.debate = openRoundsRoundOneSpeaking();
      view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await waitFor(() => expect(indicator()).toHaveAttribute('data-debate-round-indicator', '1'));
      expect(
        screen.getByText('Round 2 of 11. 1 rebuttal round so far. Another round is possible.')
      ).toBeInTheDocument();
    });

    it('shows no round indicator for a fixed format, and still puts Leave between the claim and the tiles', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
      await renderLiveDebate();

      expect(indicator()).toBeNull();
      const leave = screen.getByRole('button', { name: 'Leave debate' });
      const heading = screen.getByRole('heading', { name: 'The protocol should ship debates' });
      expect(heading.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(leave.compareDocumentPosition(debateVideoTile('local')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  // GEO-3178. After every round but the cap, both debaters pick Extend or End on a card over the
  // tiles. Picks are blind until the reveal.
  describe('open rounds microphones between rounds', () => {
    beforeEach(() => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    });

    const finalBoards = [
      {
        kind: 'wrap',
        debate: openRoundsRevealEnd,
        thankingAt: openRoundsAt('20:02:08.000'),
        holdMs: 1_500,
      },
      {
        kind: 'max',
        debate: openRoundsCapRoundLastTurn,
        thankingAt: OPEN_ROUNDS_CAP_ROUND_ENDS_AT,
        holdMs: 3_000,
      },
    ] as const;

    function expectFinalBoardMuted() {
      for (const participant of ['local', 'remote'] as const) {
        expectMutedIndicator(participant);
        expect(document.querySelector(`[data-inactive-speaker="${participant}"]`)).toHaveAttribute(
          'data-visible',
          'true'
        );
      }
    }

    for (const board of finalBoards) {
      it.each([1, 2] as const)(
        `keeps slot %s muted through the final ${board.kind} board and releases after its hold`,
        async slot => {
          if (slot === 2) joinAsBob();
          const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
          mocks.createLocalTracks.mockResolvedValue([
            audioTrack,
            { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
          ]);
          const debate = board.debate();
          vi.spyOn(Date, 'now').mockReturnValue(board.thankingAt - 500);
          const view = await renderLiveDebate(debate);

          // The local clock enters thanking before the server payload catches up.
          rerenderAt(view, board.thankingAt + 500, debate);
          await waitFor(() =>
            expect(document.querySelector(`[data-open-round-result="${board.kind}"]`)).not.toBeNull()
          );
          await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
          expectFinalBoardMuted();

          // A subsequent poll writes thanking. Neither that nor the end of the hold may drift
          // from the clock driving the board and the existing exit to the picker.
          const thanking: Debate = {
            ...debate,
            status: 'thanking',
            current_speaker_slot: null,
            turn_started_at: new Date(board.thankingAt).toISOString(),
            turn_ends_at: new Date(board.thankingAt + 60_000).toISOString(),
            open_rounds: { ...debate.open_rounds!, phase: 'finished' },
          };
          rerenderAt(view, board.thankingAt + board.holdMs - 1, thanking);
          expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
          expectFinalBoardMuted();

          rerenderAt(view, board.thankingAt + board.holdMs, thanking);
          await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
          await waitFor(() => expect(document.querySelector(`[data-open-round-result="${board.kind}"]`)).toBeNull());
          expectNoMutedIndicator('local');
          expectNoMutedIndicator('remote');
          expect(recordingSurface()).toHaveClass('invisible');
        }
      );

      it(`connects with the microphone muted while the final ${board.kind} board is held`, async () => {
        const setEnabled = vi.fn();
        let enabled = true;
        const audioTrack = {
          mediaStreamTrack: {
            kind: 'audio',
            get enabled() {
              return enabled;
            },
            set enabled(value: boolean) {
              enabled = value;
              setEnabled(value);
            },
          },
          stop: vi.fn(),
          detach: vi.fn(),
        };
        mocks.createLocalTracks.mockResolvedValue([
          audioTrack,
          { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
        ]);
        vi.spyOn(Date, 'now').mockReturnValue(board.thankingAt + 500);
        await renderLiveDebate(board.debate());

        await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false));
        expect(setEnabled).not.toHaveBeenCalledWith(true);
        expectFinalBoardMuted();
      });
    }

    it('opens the microphone for voting, then mutes the transition until the speaking turn starts', async () => {
      const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
      mocks.createLocalTracks.mockResolvedValue([
        audioTrack,
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ]);
      // Alice listens while Bob closes the opening.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      const view = await renderLiveDebate(openRoundsListening());
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
      const remoteVideo = document.createElement('video');
      const trackSubscribed = mocks.roomOn.mock.calls.find(([event]) => event === 'trackSubscribed')?.[1];
      act(() => trackSubscribed?.({ attach: () => remoteVideo }));
      expectMutedIndicator('local');

      rerenderAt(view, '20:02:03.000', openRoundsDeciding());
      await waitFor(() => expect(document.querySelector('[data-open-round-pick-card]')).not.toBeNull());
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
      expectNoMutedIndicator('local');
      expectNoMutedIndicator('remote');

      // Voting has resolved: both microphones close for the votes and round title.
      rerenderAt(view, '20:02:05.000', revealRebutWithCountIn());
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
      expectMutedIndicator('local');
      expectMutedIndicator('remote');

      rerenderAt(view, '20:02:09.000', revealRebutWithCountIn());
      await waitFor(() => expect(within(debateVideoTile('local')).getByText('Your turn in')).toBeInTheDocument());
      expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
      expectMutedIndicator('local');
      expectMutedIndicator('remote');

      // Round 2: Alice opens it, so Bob's muted indicator returns.
      rerenderAt(view, '20:02:12.400', revealRebutWithCountIn());
      await waitFor(() => expectActiveDebateVideoTile('local', 'outline-white'));
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
      expectNoMutedIndicator('local');
      expectMutedIndicator('remote');

      // Then Bob takes the second turn and Alice's mic closes.
      rerenderAt(view, '20:03:20.000', openRoundsRoundOneSpeaking());
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
      expectMutedIndicator('local');
      expectNoMutedIndicator('remote');
    });

    it.each(['opener', 'listener'] as const)(
      'keeps the %s muted through the title and final count-in second',
      async role => {
        if (role === 'listener') joinAsBob();
        const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
        mocks.createLocalTracks.mockResolvedValue([
          audioTrack,
          { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
        ]);
        vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:06.000'));
        const view = await renderLiveDebate(revealRebutWithCountIn());
        await waitFor(() => expect(document.querySelector('[data-open-round-result="round"]')).not.toBeNull());
        await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
        expectMutedIndicator('local');
        expectMutedIndicator('remote');

        // The normal one-second microphone prearm must not unmute a round transition.
        rerenderAt(view, '20:02:11.700', revealRebutWithCountIn());
        expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
        expectMutedIndicator('local');
        expectMutedIndicator('remote');

        rerenderAt(view, '20:02:12.400', revealRebutWithCountIn());
        await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(role === 'opener'));
      }
    );

    it('mutes a required round’s title and count-in even though there was no vote', async () => {
      const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
      mocks.createLocalTracks.mockResolvedValue([
        audioTrack,
        { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      ]);
      const debate = openRoundsRequiredRoundListening({ required_round_lead_in_ms: 8_000, extend_count_in_ms: 5_000 });
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:01.000'));
      const view = await renderLiveDebate(debate);
      await waitFor(() => expect(document.querySelector('[data-open-round-result="round"]')).not.toBeNull());
      await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(false));
      expectMutedIndicator('local');
      expectMutedIndicator('remote');

      rerenderAt(view, '20:02:07.500', debate);
      expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
      expectMutedIndicator('local');
      expectMutedIndicator('remote');
    });
  });

  describe('open rounds pick card (GEO-3178)', () => {
    const pickCard = () => screen.queryByRole('region', { name: /Keep debating\?|Locked in/ });

    beforeEach(() => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      mocks.savePickMutateAsync.mockResolvedValue(undefined);
    });

    it('shows nothing about picks during a turn, then opens with the countdown when the round ends', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      const view = await renderLiveDebate(openRoundsListening());
      expect(pickCard()).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Extend/ })).not.toBeInTheDocument();

      rerenderAt(view, '20:02:03.000', openRoundsDeciding());
      await waitFor(() => expect(pickCard()).toBeInTheDocument());
      expect(screen.getByText('7 seconds to pick')).toBeInTheDocument();
      const decisionRing = pickCard()?.querySelector('[data-pick-countdown-progress]');
      expect(decisionRing).toHaveAttribute('stroke-dashoffset', '0.3');
      // The card carries the window's countdown, so the tiles do not repeat it. The speaker's timer
      // fades out as the card comes in (GEO-3347).
      expect(debateVideoTile('local').querySelector('[data-countdown-progress]')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(debateVideoTile('remote').querySelector('[data-countdown-progress]')).not.toBeInTheDocument()
      );

      rerenderAt(view, '20:02:07.500', openRoundsDeciding());
      await waitFor(() => expect(decisionRing).toHaveAttribute('stroke-dashoffset', '0.75'));
      expect(screen.getByText('3 seconds to pick')).toBeInTheDocument();
    });

    it('drains the pick ring over the configured decision window when joining partway through', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:05.000'));
      await renderLiveDebate(openRoundsDeciding({ decision_window_ms: 20_000 }));

      await waitFor(() => expect(screen.getByText('15 seconds to pick')).toBeInTheDocument());
      expect(pickCard()?.querySelector('[data-pick-countdown-progress]')).toHaveAttribute('stroke-dashoffset', '0.25');
    });

    it('saves a pick for the round that just ended', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      await renderLiveDebate(openRoundsDeciding());

      fireEvent.click(await screen.findByRole('button', { name: /Extend/ }));
      expect(mocks.savePickMutateAsync).toHaveBeenCalledWith({ roundIndex: 0, pick: 'extend' });
    });

    it('reports a saved pick with how long before the deadline it came (GEO-3182)', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      mocks.savePickMutateAsync.mockResolvedValue(openRoundsDeciding({ my_pick: 'extend' }));
      await renderLiveDebate(openRoundsDeciding());

      fireEvent.click(await screen.findByRole('button', { name: /Extend/ }));
      await waitFor(() =>
        expect(mocks.capture).toHaveBeenCalledWith(
          'debate_round_pick_set',
          expect.objectContaining({
            round_index: 0,
            pick: 'extend',
            is_change: false,
            previous_pick: null,
            during_decision: true,
            turn_index: 1,
            ms_before_deadline: 7_000,
            decision_window_ms: 10_000,
          })
        )
      );
    });

    it('does not report a pick that landed after the round resolved (GEO-3182)', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      mocks.savePickMutateAsync.mockResolvedValue(null);
      await renderLiveDebate(openRoundsDeciding());

      fireEvent.click(await screen.findByRole('button', { name: /Extend/ }));
      await waitFor(() => expect(mocks.savePickMutateAsync).toHaveBeenCalled());
      await act(async () => undefined);
      expect(mocks.capture).not.toHaveBeenCalledWith('debate_round_pick_set', expect.anything());
    });

    it('shows the saved pick after a reload', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      await renderLiveDebate(openRoundsDeciding({ my_pick: 'end' }));

      expect(await screen.findByRole('button', { name: /End/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /Extend/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders the same card whether or not the other debater has picked', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      const view = await renderLiveDebate(openRoundsDeciding({ my_pick: 'extend', opponent_has_picked: false }));
      const before = (await waitFor(() => pickCard() as HTMLElement)).outerHTML;

      rerenderAt(view, '20:02:03.000', openRoundsDeciding({ my_pick: 'extend', opponent_has_picked: true }));
      expect(pickCard()?.outerHTML).toBe(before);
    });

    it('closes as soon as the round resolves', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      const view = await renderLiveDebate(openRoundsDeciding({ my_pick: 'extend', opponent_has_picked: true }));
      await waitFor(() => expect(pickCard()).toBeInTheDocument());

      // Both picked: resolved at 20:02:04.2, well inside the 10 s window.
      rerenderAt(view, '20:02:04.300', openRoundsRevealRebut());
      await waitFor(() => expect(pickCard()).not.toBeInTheDocument());
    });

    it('asks to tap again when a pick does not save', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      mocks.savePickMutateAsync.mockRejectedValue(new GeoChatRequestError('Unavailable', null, 503));
      await renderLiveDebate(openRoundsDeciding());

      const end = await screen.findByRole('button', { name: /End/ });
      fireEvent.click(end);
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save your pick. Tap again."));
      expect(end).toHaveAttribute('aria-pressed', 'false');
    });

    it('says when the other debater drops out of the call', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:03.000'));
      await renderLiveDebate(openRoundsDeciding());
      await waitFor(() => expect(pickCard()).toBeInTheDocument());

      act(() => emitRoomEvent('participantDisconnected', {}));
      expect(within(pickCard() as HTMLElement).getByRole('status')).toHaveTextContent(
        'Bob is reconnecting. Their last saved pick still counts.'
      );
    });
  });

  // GEO-3179. Both picks turn over at once, then the room says what they mean.
  describe('open rounds reveal (GEO-3179)', () => {
    const openRoundAnnouncement = () => document.querySelector('[data-open-round-announcement]');
    const reveal = (participant: 'local' | 'remote') =>
      debateVideoTile(participant).querySelector('[data-open-round-reveal]');
    const result = () => document.querySelector('[data-open-round-result]');
    const chips = (participant: 'local' | 'remote') => debateVideoTile(participant).querySelector('[data-tile-chips]');

    beforeEach(() => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    });

    it('turns both picks over, then announces the new round and who opens it', async () => {
      // Resolved Extend at 20:02:04.2; round 1 starts at 20:02:07.2.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:04.300'));
      const view = await renderLiveDebate(openRoundsRevealRebut());

      await waitFor(() => expect(reveal('local')).toHaveAttribute('data-open-round-reveal', 'extend'));
      expect(reveal('remote')).toHaveAttribute('data-open-round-reveal', 'extend');
      expect(reveal('remote')).toHaveTextContent('Extend');
      const localVote = reveal('local');
      const remoteVote = reveal('remote');
      const localPill = localVote?.querySelector('.rounded-full');
      expect(localVote).toHaveClass('opacity-100');
      expect(remoteVote).toHaveClass('opacity-100');
      expect(result()).toBeNull();
      // Nothing counts down over the picks, and nobody is counted in yet.
      expect(debateVideoTile('local').querySelector('[data-countdown-progress]')).not.toBeInTheDocument();
      expect(screen.queryByText('Your turn in')).not.toBeInTheDocument();
      expect(openRoundAnnouncement()).toHaveTextContent('You: Extend. Bob: Extend.');

      // The picks stay up for 1.95 s, leaving a 1.05 s title (GEO-3522).
      rerenderAt(view, '20:02:05.500', openRoundsRevealRebut());
      expect(result()).toBeNull();

      rerenderAt(view, '20:02:06.200', openRoundsRevealRebut());
      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'round'));
      expect(result()?.textContent).toBe('Round 2RebuttalYou open');
      expect(document.querySelector('[data-debate-round-indicator]')).toHaveAttribute(
        'data-debate-round-indicator',
        '1'
      );
      // The same votes remain behind the title, fading back rather than disappearing.
      expect(reveal('local')).toBe(localVote);
      expect(reveal('remote')).toBe(remoteVote);
      expect(reveal('local')?.querySelector('.rounded-full')).toBe(localPill);
      expect(localVote).toHaveClass('opacity-40', 'transition-opacity', 'duration-250');
      expect(remoteVote).toHaveClass('opacity-40');
      expect(localVote?.closest('[data-room-leaving]')).toBeNull();
      expect(chips('local')).toHaveAttribute('data-tile-chips', 'visible');
      expect(chips('remote')).toHaveAttribute('data-tile-chips', 'visible');
      expect(screen.queryByText('Your turn in')).not.toBeInTheDocument();

      // With no count-in from geo-chat, "Round 2" holds to the end of the window.
      rerenderAt(view, '20:02:06.900', openRoundsRevealRebut());
      expect(result()?.textContent).toBe('Round 2RebuttalYou open');
      expect(reveal('local')).toBe(localVote);
      expect(reveal('remote')).toBe(remoteVote);
      expect(screen.queryByText('Your turn in')).not.toBeInTheDocument();
    });

    it.each(['required', 'extend'] as const)(
      'counts a new %s round in for 3 s, then opens the microphone on time',
      async kind => {
        const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() };
        mocks.createLocalTracks.mockResolvedValue([
          audioTrack,
          { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
        ]);
        const debate: Debate =
          kind === 'required'
            ? openRoundsRequiredRoundListening({ required_round_lead_in_ms: 5_000, extend_count_in_ms: 3_000 })
            : revealRebutWithCountIn(3_000);
        const startAt = openRoundsAt(kind === 'required' ? '20:02:05.000' : '20:02:10.200');
        vi.spyOn(Date, 'now').mockReturnValue(startAt - 3_500);
        const view = await renderLiveDebate(debate);
        await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'round'));
        await waitFor(() => expect(screen.queryByText('Your turn in')).not.toBeInTheDocument());
        expect(audioTrack.mediaStreamTrack.enabled).toBe(false);

        for (const seconds of [3, 2, 1]) {
          rerenderAt(view, startAt - seconds * 1_000, debate);
          await waitFor(() => expect(within(debateVideoTile('local')).getByText('Your turn in')).toBeInTheDocument());
          expect(within(debateVideoTile('local')).getByText(String(seconds))).toBeInTheDocument();
          expect(audioTrack.mediaStreamTrack.enabled).toBe(false);
        }
        // The title's exit finishes during the count-in.
        await waitFor(() => expect(result()).toBeNull());
        rerenderAt(view, startAt + 100, debate);
        await waitFor(() => expectActiveDebateVideoTile('local', 'outline-white'));
        await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
        await waitFor(() => expect(screen.queryByText('Your turn in')).not.toBeInTheDocument());
      }
    );

    it('counts the opener in for 5 s after the announcement', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:06.000'));
      const view = await renderLiveDebate(revealRebutWithCountIn());
      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'round'));

      rerenderAt(view, '20:02:07.300', revealRebutWithCountIn());
      await waitFor(() => expect(within(debateVideoTile('local')).getByText('Your turn in')).toBeInTheDocument());
      expect(within(debateVideoTile('local')).getByText('5')).toBeInTheDocument();
      // The round announcement fades out as the count-in comes in (GEO-3366).
      await waitFor(() => expect(result()).toBeNull());
      await waitFor(() => expect(reveal('local')).toBeNull());
      expect(reveal('remote')).toBeNull();
      expect(chips('local')).toHaveAttribute('data-tile-chips', 'visible');

      rerenderAt(view, '20:02:11.300', revealRebutWithCountIn());
      await waitFor(() => expect(within(debateVideoTile('local')).getByText('1')).toBeInTheDocument());

      // Round 1 starts at 20:02:12.2, Alice first.
      rerenderAt(view, '20:02:12.400', revealRebutWithCountIn());
      await waitFor(() => expect(debateVideoTile('local')).toHaveAttribute('data-active-speaker', 'true'));
      await waitFor(() => expect(screen.queryByText('Your turn in')).not.toBeInTheDocument());
    });

    it('clears the listener’s announcement and votes before the opener’s count-in ends', async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:09.000'));
      await renderLiveDebate(revealRebutWithCountIn());

      await waitFor(() => expect(result()).toBeNull());
      expect(reveal('local')).toBeNull();
      expect(reveal('remote')).toBeNull();
      expect(screen.queryByText('Your turn in')).not.toBeInTheDocument();
    });

    it('names the other debater as the opener on their screen', async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:06.200'));
      await renderLiveDebate(openRoundsRevealRebut());

      await waitFor(() => expect(result()).toHaveTextContent('Alice opens'));
    });

    it('steps from the picks to the result on its own timer, not the room tick', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:05.000'));
      await renderLiveDebate(openRoundsRevealRebut());
      await waitFor(() => expect(reveal('local')).toBeInTheDocument());

      // The room clock stays at 20:02:05 (0.8 s in); the reveal's own timer reaches 1.95 s.
      await act(async () => {
        vi.advanceTimersByTime(1_200);
      });
      expect(result()).toHaveAttribute('data-open-round-result', 'round');
      vi.useRealTimers();
    });

    it('keeps a split up beside "That\'s a wrap", with no blame line', async () => {
      // Alice Extend, Bob End, resolved at 20:02:05.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:06.500'));
      await renderLiveDebate(openRoundsRevealEnd());

      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'wrap'));
      expect(result()?.textContent).toBe('That’s a wrap');
      expect(reveal('local')).toHaveAttribute('data-open-round-reveal', 'extend');
      expect(reveal('remote')).toHaveAttribute('data-open-round-reveal', 'end');
      // Each pick is stamped onto its own tile, and stays there under the banner.
      expect(reveal('local')).toHaveTextContent('Extend');
      expect(reveal('remote')).toHaveTextContent('End');
      expect(reveal('local')).toHaveClass('opacity-100');
      expect(reveal('remote')).toHaveClass('opacity-100');
    });

    it('shows a missing pick as no pick, and says why the debate ended', async () => {
      // Alice Extend, Bob never picked; resolved by the sweep at 20:02:11.3.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:11.400'));
      const view = await renderLiveDebate(openRoundsTimedOut());

      await waitFor(() => expect(reveal('remote')).toHaveAttribute('data-open-round-reveal', 'none'));
      expect(reveal('remote')).toHaveTextContent('No pick');
      // A missing pick is neither choice; this payload ended because geo-chat counted it as End.
      expect(reveal('remote')).not.toHaveTextContent(/\bEnd\b/);

      rerenderAt(view, '20:02:12.800', openRoundsTimedOut());
      await waitFor(() => expect(result()).toHaveTextContent("Bob didn't pick in time"));
      expect(openRoundAnnouncement()).toHaveTextContent(
        "You: Extend. Bob: no pick. That's a wrap. Bob didn't pick in time."
      );
    });

    it('says the debate hit the maximum after the cap round, then hands over to the picker', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 1_000);
      const view = await renderLiveDebate(openRoundsCapRoundLastTurn());

      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'max'));
      expect(result()).toHaveTextContent('That’s the max11 rounds');
      expect(recordingSurface()).not.toHaveClass('invisible');
      expect(screen.queryByText('Say thanks')).not.toBeInTheDocument();
      expect(document.querySelector('[data-open-round-reveal]')).toBeNull();

      rerenderAt(view, OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 3_500, openRoundsCapRoundLastTurn());
      await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
      await waitFor(() => expect(result()).toBeNull());
    });

    // Copilot on #2853: both rooms consent the moment thanking starts, so a live session must not
    // take the pair to the picker while the debate's last result is still up.
    it('waits out "That\'s the max" before following a live session to the picker', async () => {
      installRecordingMocks();
      vi.spyOn(Date, 'now').mockReturnValue(OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 1_000);
      mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
      const view = await renderLiveDebate({ ...openRoundsCapRoundLastTurn(), rematch_session_id: 'rematch-1' });

      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'max'));
      // Long enough for the save and the navigation it would otherwise lead straight into.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 1_000));
      });
      expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');
      expect(result()).toHaveAttribute('data-open-round-result', 'max');

      rerenderAt(view, OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 3_500, {
        ...openRoundsCapRoundLastTurn(),
        rematch_session_id: 'rematch-1',
      });
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    });

    // Copilot on #2853: an idle tab (reloaded, or another tab had the call) draws the same reveal
    // from a completed debate, and its way to the picker has to wait it out too.
    it('waits out "That\'s the max" on an idle tab before following a live session', async () => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
      const thankingStartedAt = new Date(OPEN_ROUNDS_CAP_ROUND_ENDS_AT).toISOString();
      const completed = {
        ...openRoundsCapRoundLastTurn(),
        status: 'complete' as const,
        turn_started_at: thankingStartedAt,
        turn_ends_at: new Date(OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 20_000).toISOString(),
        completed_at: new Date(OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 500).toISOString(),
        rematch_session_id: 'rematch-1',
      };
      vi.spyOn(Date, 'now').mockReturnValue(OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 1_000);
      mocks.rematch = rematchSession('browsing', { localConsented: true, remoteConsented: true });
      mocks.debate = completed;
      const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 1_000));
      });
      expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');

      rerenderAt(view, OPEN_ROUNDS_CAP_ROUND_ENDS_AT + 3_500, completed);
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
    });

    it('holds "That\'s a wrap" into thanking before the handoff', async () => {
      // Thanking starts at 20:02:08, at the end of the result window.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:08.500'));
      const view = await renderLiveDebate(openRoundsRevealEnd());

      await waitFor(() => expect(result()).toHaveAttribute('data-open-round-result', 'wrap'));
      expect(reveal('remote')).toHaveAttribute('data-open-round-reveal', 'end');
      expect(recordingSurface()).not.toHaveClass('invisible');
      expect(screen.queryByText('Say thanks')).not.toBeInTheDocument();

      rerenderAt(view, '20:02:09.600', openRoundsThankingAfterEnd());
      await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
      await waitFor(() => expect(result()).toBeNull());
      await waitFor(() => expect(reveal('remote')).toBeNull());
    });
  });

  // The updated classic mockup removes the Last word chip from every recording state.
  describe('open rounds without a Last word chip (GEO-3366)', () => {
    const lastWord = (participant: 'local' | 'remote') =>
      debateVideoTile(participant).querySelector('[data-open-round-last-word]');

    beforeEach(() => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    });

    it("omits the chip on both speakers' tiles", async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      await renderLiveDebate(openRoundsListening());

      await waitFor(() => expect(debateVideoTile('remote')).toHaveAttribute('data-active-speaker', 'true'));
      expect(lastWord('remote')).toBeNull();
      expect(lastWord('local')).toBeNull();
    });

    it("omits the chip on the second speaker's own tile", async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      await renderLiveDebate(openRoundsListening());

      await waitFor(() => expect(debateVideoTile('local')).toHaveAttribute('data-active-speaker', 'true'));
      expect(lastWord('local')).toBeNull();
    });

    it('says nothing during the first turn of a round', async () => {
      // Round 1 runs from 20:02:07.2, Alice first.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:30.000'));
      await renderLiveDebate(openRoundsRoundOneSpeaking());

      await waitFor(() => expect(debateVideoTile('local')).toHaveAttribute('data-active-speaker', 'true'));
      expect(lastWord('local')).toBeNull();
      expect(lastWord('remote')).toBeNull();
    });

    it('omits the chip in the cap round too', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(OPEN_ROUNDS_CAP_ROUND_ENDS_AT - 20_000);
      await renderLiveDebate(openRoundsCapRoundLastTurn());

      await waitFor(() => expect(debateVideoTile('remote')).toHaveAttribute('data-active-speaker', 'true'));
      expect(lastWord('remote')).toBeNull();
    });

    it('leaves fixed formats alone', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
      await renderLiveDebate({ current_turn_index: 1, current_speaker_slot: 2 });

      expect(document.querySelector('[data-open-round-last-word]')).toBeNull();
    });
  });

  // GEO-3366: classic outlined type and glass pills, with the room's timer build-up.
  describe('open rounds classic + glass (GEO-3366)', () => {
    const pill = (participant: 'local' | 'remote', kind: string) =>
      debateVideoTile(participant).querySelector(`[data-room-pill="${kind}"]`);
    const phrase = (participant: 'local' | 'remote', kind: string) =>
      debateVideoTile(participant).querySelector(`[data-room-phrase="${kind}"]`);
    const timer = (participant: 'local' | 'remote') => debateVideoTile(participant).querySelector('[data-turn-timer]');
    const lastWord = (participant: 'local' | 'remote') =>
      debateVideoTile(participant).querySelector('[data-open-round-last-word]');
    /** Alice's opening, 20:00:00 to 20:01:00. */
    const aliceOpening = (): Debate => ({
      ...openRoundsListening(),
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-10-06T20:00:00.000Z',
      turn_ends_at: '2026-10-06T20:01:00.000Z',
    });

    beforeEach(() => {
      mocks.getServerTime.mockRejectedValue(new Error('Clock endpoint unavailable'));
    });

    it('shows a white glass Go pill as your turn starts', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:00:00.500'));
      await renderLiveDebate(aliceOpening());

      await waitFor(() => expect(pill('local', 'go')).toHaveTextContent('Go'));
      expect(pill('local', 'go')).toHaveClass('rounded-full', 'bg-white');
      expect(screen.queryByText('GO!')).not.toBeInTheDocument();
    });

    it('counts you in to your opening with "You\'re up in" in white outlined type above the number', async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:00:57.500'));
      await renderLiveDebate(aliceOpening());

      await waitFor(() => expect(phrase('local', 'count-in')).toHaveTextContent('You’re up in'));
      expect(phrase('local', 'count-in')).toHaveClass('text-white/85', 'font-semibold');
      expect((phrase('local', 'count-in') as HTMLElement).style.fontFamily).toContain('var(--font-calibre)');
      expect((phrase('local', 'count-in') as HTMLElement).style.textShadow).toBe(
        '-0.035em -0.035em 0 #000, 0 -0.035em 0 #000, 0.035em -0.035em 0 #000, 0.035em 0 0 #000, 0.035em 0.035em 0 #000, 0 0.035em 0 #000, -0.035em 0.035em 0 #000, -0.035em 0 0 #000, 0 0.05em 0.16em rgba(0,0,0,0.55)'
      );
      expect(debateVideoTile('local').querySelector('[data-room-count-in]')).toHaveTextContent('3');
      expect(debateVideoTile('local').querySelector('[data-room-dim]')).toHaveAttribute('data-room-dim', 'on');
    });

    it('counts you in to every later turn with "Your turn in", never "Rebut in"', async () => {
      joinAsBob();
      // Alice's rebuttal ends at 20:02:52.2; Bob's follows.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:49.500'));
      await renderLiveDebate(openRoundsRoundOneSpeaking());

      await waitFor(() => expect(phrase('local', 'count-in')).toHaveTextContent('Your turn in'));
      expect(screen.queryByText('Rebut in')).not.toBeInTheDocument();
    });

    it('builds the timer up from 10 s, then turns it and the outline red with "Wrap it up" through the final 5 s', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:44.000'));
      const view = await renderLiveDebate(openRoundsRoundOneSpeaking());

      // 8.2 s left: growing a step a second, not yet red.
      await waitFor(() => expect(timer('local')).toHaveAttribute('data-turn-timer', 'building'));
      expect(timer('local')).toHaveStyle({ scale: '1.12' });
      expect(debateVideoTile('local')).toHaveClass('outline-white');
      expect(pill('local', 'wrap-it-up')).toBeNull();

      // 4.7 s left: red at full size, its rim draining, and the pill up.
      rerenderAt(view, '20:02:47.500', openRoundsRoundOneSpeaking());
      await waitFor(() => expect(timer('local')).toHaveAttribute('data-turn-timer', 'final'));
      expect(timer('local')).toHaveStyle({ scale: '1.3' });
      expect(timer('local')?.querySelector('[data-turn-timer-rim]')).toBeInTheDocument();
      expect(debateVideoTile('local')).toHaveClass('outline-[#FF4A26]');
      expect(debateVideoTile('local').querySelector('[data-room-speaker-outline]')).toHaveClass('border-[#FF4A26]');
      expect(debateVideoTile('local')).not.toHaveClass('outline-purple');
      expect(pill('local', 'wrap-it-up')).toHaveTextContent('Wrap it up');
      expect(pill('local', 'wrap-it-up')).toHaveClass('rounded-full', 'bg-[#FF4A26]/90');

      // 2.7 s left: the pill stays with the red timer, as in the mockup.
      rerenderAt(view, '20:02:49.500', openRoundsRoundOneSpeaking());
      expect(pill('local', 'wrap-it-up')).toHaveTextContent('Wrap it up');
      expect(timer('local')).toHaveAttribute('data-turn-timer', 'final');
    });

    it("shows the listener the same red timer and outline on the speaker's tile", async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:47.500'));
      await renderLiveDebate(openRoundsRoundOneSpeaking());

      await waitFor(() => expect(timer('remote')).toHaveAttribute('data-turn-timer', 'final'));
      expect(debateVideoTile('remote')).toHaveClass('outline-[#FF4A26]');
      expect(debateVideoTile('remote').querySelector('[data-room-speaker-outline]')).toHaveClass('border-[#FF4A26]');
    });

    it('labels your tile "Turn ended" when you end early, and puts up the other debater\'s turn', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:20.000'));
      mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
      await renderLiveDebate(openRoundsRoundOneSpeaking());

      fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));

      await waitFor(() => expect(pill('local', 'ended')).toHaveTextContent('Turn ended'));
      expect(screen.queryByText('Ending turn…')).not.toBeInTheDocument();
      expect(pill('remote', 'turn')).toHaveTextContent('Bob’s turn');
      expect(pill('remote', 'turn')).toHaveClass('rounded-full', 'backdrop-blur-[14px]');
      expect(pill('local', 'ended')).toHaveClass('border-dashed');
      expect(debateVideoTile('local')).toHaveAttribute('data-active-speaker', 'false');
      expect(debateVideoTile('local').querySelector('[data-room-speaker-outline]')).toBeNull();
    });

    // GEO-3347. geo-chat closes a round-ending yield the moment it accepts it, so a pill there lasted
    // the request's round trip and then faded under the pick: a flicker.
    it('does not label "Turn ended" when ending the round\'s last turn, which goes to the pick', async () => {
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:03:10.000'));
      mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
      await renderLiveDebate({
        ...openRoundsRoundOneSpeaking(),
        current_turn_index: 3,
        current_speaker_slot: 2,
        turn_started_at: '2026-10-06T20:02:52.200Z',
        turn_ends_at: '2026-10-06T20:03:37.200Z',
      });

      fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));

      await waitFor(() => expectMutedIndicator('local'));
      expect(pill('local', 'ended')).toBeNull();
      expect(debateVideoTile('local').querySelector('[data-room-dim]')).toHaveAttribute('data-room-dim', 'on');
    });

    it('names no next turn when ending a turn geo-chat closes at once, even one that runs straight on', async () => {
      // Bob's opening runs straight into a required round, but it is a round's second turn.
      joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
      await renderLiveDebate(openRoundsRequiredRoundListening());

      fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));

      await waitFor(() => expectMutedIndicator('local'));
      expect(pill('local', 'ended')).toBeNull();
      expect(pill('remote', 'turn')).toBeNull();
    });

    it('keeps one circle and fades the timer away before bringing in the muted microphone', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:20.000'));
      mocks.endTurnMutateAsync.mockReturnValue(deferred<Debate>().promise);
      await renderLiveDebate(openRoundsRoundOneSpeaking());
      await waitFor(() => expect(timer('local')).not.toBeNull());
      const badge = timer('local');
      const face = badge?.querySelector('[data-recording-badge-face]');
      const timerNumber = badge?.querySelector('span.relative');

      fireEvent.click(await screen.findByRole('button', { name: 'End turn' }));

      await waitFor(() => expectMutedIndicator('local'));
      expect(debateVideoTile('local').querySelector('[data-recording-badge]')).toBe(badge);
      expect(badge?.querySelector('[data-recording-badge-face]')).toBe(face);
      expect(timer('local')).toBeNull();
      const indicator = badge?.querySelector('[data-muted-indicator="true"]');
      expect(timerNumber?.parentElement).toHaveStyle({
        opacity: 0,
        transitionDuration: '100ms',
        transitionDelay: '0ms',
      });
      expect(indicator?.parentElement).toHaveStyle({
        opacity: 1,
        transitionDuration: '150ms',
        transitionDelay: '100ms',
      });
      expect(indicator?.querySelector('path')).toHaveAttribute('fill-opacity', '0');
      await waitFor(() => expect(timerNumber).not.toBeInTheDocument());
    });

    it('dims both tiles under the pick panel', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:02.000'));
      await renderLiveDebate(openRoundsDeciding());

      await waitFor(() => expect(screen.getByRole('region', { name: 'Keep debating?' })).toBeInTheDocument());
      expect(debateVideoTile('local').querySelector('[data-room-dim]')).toHaveAttribute('data-room-dim', 'on');
      expect(debateVideoTile('remote').querySelector('[data-room-dim]')).toHaveAttribute('data-room-dim', 'on');
    });

    it('steps the timer aside for the count-in, so the phrase never half-covers it', async () => {
      // Preflight: Preston opens at 20:00:00 and is counted in over its last 3 s.
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('19:59:57.500'));
      await renderLiveDebate({ ...aliceOpening(), status: 'preflight', started_at: null });

      await waitFor(() => expect(phrase('local', 'count-in')).toHaveTextContent('You’re up in'));
      expect(debateVideoTile('local').querySelector('[aria-label^="Phase timer:"]')).not.toBeInTheDocument();
    });

    it.each(['Alice', 'Bob'])("hides the opponent's wrap-up prompt from %s (GEO-2415)", async listener => {
      if (listener === 'Bob') joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt(listener === 'Bob' ? '20:02:47.500' : '20:01:56.500'));
      await renderLiveDebate(listener === 'Bob' ? openRoundsRoundOneSpeaking() : openRoundsListening());

      await waitFor(() => expect(timer('remote')).toHaveAttribute('data-turn-timer', 'final'));
      expect(pill('remote', 'wrap-it-up')).toBeNull();
      expect(pill('local', 'wrap-it-up')).toBeNull();
      expect(screen.queryByText(/^Wrap it up!?$/)).not.toBeInTheDocument();
    });

    it.each(['Alice', 'Bob'])('shows %s their own wrap-up prompt (GEO-2415)', async speaker => {
      if (speaker === 'Bob') joinAsBob();
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt(speaker === 'Bob' ? '20:01:56.500' : '20:02:47.500'));
      await renderLiveDebate(speaker === 'Bob' ? openRoundsListening() : openRoundsRoundOneSpeaking());

      await waitFor(() => expect(pill('local', 'wrap-it-up')).toHaveTextContent('Wrap it up'));
      expect(pill('remote', 'wrap-it-up')).toBeNull();
    });

    it('counts nobody in over the last word, which leads to the pick, even with the next round appended', async () => {
      // Bob's last word of round 1 ends at 20:03:37.2; round 2 is already appended here.
      const debate = openRoundsRoundOneSpeaking();
      const appended: Debate = {
        ...debate,
        current_turn_index: 3,
        current_speaker_slot: 2,
        turn_durations_ms: [...debate.turn_durations_ms, 45_000, 45_000],
        open_rounds: {
          ...debate.open_rounds!,
          turn_roles: ['opening', 'opening', 'rebuttal', 'rebuttal', 'rebuttal', 'rebuttal'],
        },
      };
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:03:34.000'));
      await renderLiveDebate(appended);

      await waitFor(() => expect(debateVideoTile('remote')).toHaveAttribute('data-active-speaker', 'true'));
      expect(phrase('local', 'count-in')).toBeNull();
    });

    it("keeps the speaker's corner free of Last word", async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:01:30.000'));
      await renderLiveDebate(openRoundsListening());

      await waitFor(() => expect(debateVideoTile('remote')).toHaveAttribute('data-active-speaker', 'true'));
      expect(lastWord('remote')).toBeNull();
      expect(lastWord('local')).toBeNull();
    });

    // GEO-3315 drew thanking as a purple "Say thanks" phrase over an end card with the round count.
    // GEO-3301 removed the end card and hides the room between the last turn and the picker, so
    // neither is on screen once the reveal has gone.
    it('hides the room through thanking, with no end card or round count', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:09.600'));
      await renderLiveDebate(openRoundsThankingAfterEnd());

      await waitFor(() => expect(recordingSurface()).toHaveClass('invisible'));
      expect(screen.queryByText('Debate again?')).toBeNull();
      expect(document.querySelector('[data-debate-again-rounds]')).toBeNull();
    });
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
    expect(screen.queryByRole('dialog', { name: 'Leaving the debate' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
  });

  it('enters the converted rematch debate when the room reloads onto a completed debate', async () => {
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = { ...rematchSession('converted'), converted_debate_id: 'debate-2' };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/debate-2'));
    expect(screen.queryByRole('dialog', { name: 'Leaving the debate' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
  });

  // GEO-3149: an idle room behind another tab used to follow the session too, so the viewer's
  // tabs all walked into the next room together and a background one could end up holding it.
  it('does not follow a converted rematch that another tab already took, and offers the way in', async () => {
    setDocumentVisibility('hidden');
    window.localStorage.setItem(
      'geo:debate-tab-claim:debate:debate-2',
      JSON.stringify({ tabId: 'the-other-tab', at: Date.now() })
    );
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = { ...rematchSession('converted'), converted_debate_id: 'debate-2' };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Your debate is open in another tab.', {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/debate-2');

    fireEvent.click(screen.getByRole('button', { name: 'Open it here' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/debate-2');
  });

  it('still follows from a background tab when no other tab took the next step', async () => {
    setDocumentVisibility('hidden');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    mocks.rematch = rematchSession('browsing');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'), {
      timeout: 3_000,
    });
  });

  it('enters the rematch browser after the live connection drops before the debate completes', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate({ rematch_session_id: 'rematch-1' });
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    act(() => emitRoomEvent('disconnected', 99));
    expect(await screen.findByText('Lost connection to the debate room.')).toBeInTheDocument();

    mocks.rematch = rematchSession('browsing');
    mocks.debate = { ...completedDebateOutsideThankYou(), rematch_session_id: 'rematch-1' };
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
    mocks.debate = { ...completedDebateOutsideThankYou(), rematch_session_id: 'rematch-1' };
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

    mocks.debate = completedDebateOutsideThankYou();
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

  it.each(['ready', 'in_progress', 'open_rounds'] as const)(
    'returns to the lobby from a %s debate with a visible label',
    async status => {
      setHistoryLength(2);
      rememberLobbyReturnDestination('lobby-1');
      if (status === 'ready') mocks.debate = readyDebate({ localReady: false, remoteReady: false });
      if (status === 'open_rounds') vi.spyOn(Date, 'now').mockReturnValue(openRoundsAt('20:02:20.000'));
      const view =
        status === 'ready'
          ? render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />)
          : await renderLiveDebate(status === 'open_rounds' ? openRoundsRoundOneSpeaking() : undefined);

      const back = await screen.findByRole('button', { name: 'Back to lobby' });
      expect(back).toHaveTextContent('Back to lobby');
      fireEvent.click(back);

      await waitFor(() => expect(mocks.abortMutateAsync).toHaveBeenCalledOnce());
      expect(mocks.replace).toHaveBeenCalledWith('/debate/lobby-1');
      expect(mocks.back).not.toHaveBeenCalled();
      view.unmount();
    }
  );

  it('retains an in-memory recording after a quota failure and retries the same Blob', async () => {
    mocks.enqueueRecording.mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebateOutsideThankYou();
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

// The saved count-in follows the result window. Default to the legacy 5 s snapshot so
// existing tests continue to protect debates already created with that duration.
function revealRebutWithCountIn(countInMs = 5_000): Debate {
  const debate = openRoundsRevealRebut();
  const turnStartsAtMs = Date.parse(debate.open_rounds!.next_phase_starts_at!) + countInMs;
  return {
    ...debate,
    turn_started_at: new Date(turnStartsAtMs).toISOString(),
    turn_ends_at: new Date(turnStartsAtMs + debate.turn_durations_ms[debate.current_turn_index]).toISOString(),
    open_rounds: { ...debate.open_rounds!, extend_count_in_ms: countInMs },
  };
}

/** Moves the room's clock to `time` (an Open rounds fixture time, or epoch ms) and serves `debate`. */
function rerenderAt(view: ReturnType<typeof render>, time: string | number, debate: Debate) {
  vi.mocked(Date.now).mockReturnValue(typeof time === 'string' ? openRoundsAt(time) : time);
  mocks.debate = debate;
  view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
}

/** Puts the viewer in Bob's seat: slot 2, arguing No. */
function joinAsBob() {
  mocks.currentUserId = 'user-b';
  mocks.liveKitJoinMutateAsync.mockResolvedValue({
    token: 'livekit-token',
    url: 'wss://livekit.test',
    room_name: 'geo-debate-debate-1',
    role: 'participant',
    participant_slot: 2,
    position: false,
    position_label: 'No',
  });
}

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

function expectActiveDebateVideoTile(participant: 'local' | 'remote', outline = 'outline-purple') {
  expect(debateVideoTile(participant)).toHaveAttribute('data-active-speaker', 'true');
  expect(debateVideoTile(participant)).toHaveClass(
    'outline-[3px]',
    outline === 'outline-purple' ? 'outline-offset-0' : '-outline-offset-3',
    outline
  );
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
  expect(indicator).toHaveClass(mocks.debate?.open_rounds ? 'size-[9cqw]' : 'size-[51px]');

  const paths = indicator?.querySelectorAll('path');
  const background = paths?.[0];
  const gradient = indicator?.querySelector('linearGradient');
  expect(background).toHaveAttribute(
    'd',
    'M0 25.5C0 11.4167 11.4167 0 25.5 0C39.5833 0 51 11.4167 51 25.5C51 39.5833 39.5833 51 25.5 51C11.4167 51 0 39.5833 0 25.5Z'
  );
  expect(background).toHaveAttribute('fill', `url(#${gradient?.id})`);
  expect(background).toHaveAttribute('fill-opacity', mocks.debate?.open_rounds ? '0' : '0.5');
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

/** A copy fading out in Open rounds (GEO-3347) is inert and hidden, so it no longer counts as shown. */
function expectNoMutedIndicator(participant: 'local' | 'remote') {
  const shown = [
    ...document.querySelectorAll(`[data-inactive-speaker="${participant}"] [data-muted-indicator="true"]`),
  ].filter(indicator => !indicator.closest('[data-room-leaving]'));
  expect(shown).toEqual([]);
}

function debateVideoTile(participant: 'local' | 'remote') {
  const tile = document.querySelector(`[data-inactive-speaker="${participant}"]`)?.closest('section');
  if (!(tile instanceof HTMLElement)) throw new Error(`Missing ${participant} debate video tile`);
  return tile;
}

/** Returns the recorders as they are constructed, so a test can drive `stop` / `error` itself. */
function installRecordingMocks() {
  const recorders: EventTarget[] = [];
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
        recorders.push(this);
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
  return recorders;
}

/** A Web Audio stand-in for the speech detectors: each context remembers which tracks it reads. */
function installSpeechAnalysisMocks() {
  const contexts: Array<{ tracks: MediaStreamTrack[]; close: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(readonly tracks: MediaStreamTrack[] = []) {}

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
  vi.stubGlobal(
    'AudioContext',
    class {
      readonly record = { tracks: [] as MediaStreamTrack[], close: vi.fn(() => Promise.resolve()) };
      close = this.record.close;

      constructor() {
        contexts.push(this.record);
      }

      createMediaStreamSource(stream: { tracks: MediaStreamTrack[] }) {
        this.record.tracks.push(...stream.tracks);
        return { connect: () => undefined, disconnect: () => undefined };
      }

      createAnalyser() {
        return {
          fftSize: 256,
          getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0),
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }
    }
  );
  return contexts;
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
    restartTrack: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    detach: vi.fn(),
  };
}

function MediaPreviewObserver({ onChange }: { onChange: (stream: MediaStream | null) => void }) {
  const { previewStream } = useDebateMediaSession();
  React.useEffect(() => onChange(previewStream), [onChange, previewStream]);
  return null;
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

function completedDebateOutsideThankYou(): Debate {
  return {
    ...completedDebate(),
    turn_started_at: '2026-07-02T00:00:00.000Z',
    turn_ends_at: '2026-07-02T00:00:20.000Z',
    completed_at: '2026-07-02T00:00:20.000Z',
  };
}

/**
 * A card that handed over one device. It claims the debate's own session and opens the microphone
 * only, which is what accepting a request with the camera off leaves behind.
 */
function MicOnlyHandover() {
  const media = useDebateMediaSession();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    media.beginSession(debateMediaSessionKey('debate-1'));
    media.joinChoiceRef.current = { micOn: true, cameraOn: false };
    void media.ensurePreview({ audio: true, video: false }).catch(() => undefined);
  }, [media]);

  return <div data-testid="handover-tracks">{media.localTracksRef.current.length}</div>;
}

/** A card that handed the room a session and opened nothing: the listening-only choice. */
function ListeningOnlyHandover() {
  const media = useDebateMediaSession();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    media.beginSession(debateMediaSessionKey('debate-1'));
    media.joinChoiceRef.current = { micOn: false, cameraOn: false };
  }, [media]);

  return <div data-testid="handover-tracks">{media.localTracksRef.current.length}</div>;
}

/**
 * A card whose acquisition is still running when the room mounts, which is what tapping Accept the
 * moment the camera comes on looks like — or a cold `livekit-client` import on a phone.
 */
function InFlightHandover({ kinds }: { kinds: { audio: boolean; video: boolean } }) {
  const media = useDebateMediaSession();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    media.beginSession(debateMediaSessionKey('debate-1'));
    media.joinChoiceRef.current = { micOn: kinds.audio, cameraOn: kinds.video };
    void media.ensurePreview(kinds).catch(() => undefined);
  }, [kinds, media]);

  return <div data-testid="handover-tracks">{media.localTracksRef.current.length}</div>;
}

/** A card that opened the mic, then asked for the camera as well, which is still opening. */
function CameraAddedHandover() {
  const media = useDebateMediaSession();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    media.beginSession(debateMediaSessionKey('debate-1'));
    media.joinChoiceRef.current = { micOn: true, cameraOn: true };
    void (async () => {
      await media.ensurePreview({ audio: true, video: false }).catch(() => undefined);
      void media.ensurePreview({ audio: true, video: true }).catch(() => undefined);
    })();
  }, [media]);

  return <div data-testid="handover-tracks">{media.localTracksRef.current.length}</div>;
}

/** A request card that hands its session to the room, as `DebateRequestDialog` does. */
function CardOverLobby() {
  const retain = React.useRef(true);
  return <DebateRequestMediaPreview sessionKey={debateMediaSessionKey('debate-1')} retain={retain} />;
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

/**
 * The room's own surface. GEO-3301 hides it between the last turn and the claim picker rather than
 * unmounting it, so the media elements stay put while the recording is saved.
 */
function recordingSurface() {
  return screen.getByRole('dialog', { name: 'Debate recording' }).querySelector('main')!;
}

function rematchSession(
  status: DebateRematchSession['status'],
  { localConsented = false, remoteConsented = false }: { localConsented?: boolean; remoteConsented?: boolean } = {}
): DebateRematchSession {
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
        consented_at: localConsented ? '2026-07-02T00:01:15.000Z' : null,
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: remoteConsented ? '2026-07-02T00:01:15.000Z' : null,
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
