'use client';

import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import * as React from 'react';

import cx from 'classnames';
import type { RoomConnectOptions, RoomOptions } from 'livekit-client';
import { useRouter } from 'next/navigation';

import { capture } from '~/core/analytics';
import {
  type Debate,
  type DebateRematchSession,
  type LiveKitJoinResponse,
  type ParticipantSlot,
  getCurrentGeoChatUserId,
  getServerTime,
} from '~/core/debates/api';
import { DebatePreScreen } from '~/core/debates/debate-pre-join-screen';
import { usePrefetchClaimSpaceAllowlist } from '~/core/debates/use-prefetch-claim-space-allowlist';
import { consumeDebateReturnDestination } from '~/core/debates/debate-return-navigation';
import {
  CameraIcon,
  LeaveIcon,
  MicrophoneIcon,
  MutedMicrophoneIndicator,
  RecordingCircleButton,
  SpeakerIcon,
} from '~/core/debates/debate-room-controls';
import {
  type DebateRoomOwnershipCoordinationMode,
  type DebateRoomOwnershipCoordinator,
  createDebateRoomOwnershipCoordinator,
  debateRoomTabPriority,
} from '~/core/debates/debate-room-ownership';
import {
  useAbortDebate,
  useClearDebateActivity,
  useClearTimedOutDebateActivity,
  useConsentToDebateRematch,
  useDebate,
  useDebateRematch,
  useEndDebateTurn,
  useLeaveDebateRematch,
  useLiveKitJoin,
  useMarkDebateJoined,
  useMarkDebateReady,
} from '~/core/debates/hooks';
import {
  DebateMediaSessionBoundary,
  type LocalTrackLike,
  debateMediaSessionKey,
  useDebateMediaSession,
} from '~/core/debates/media-session';
import { RecordingCountdownRing } from '~/core/debates/recording-countdown-ring';
import {
  debateRecordingUploadId,
  deleteDebateRecordingUpload,
  enqueueDebateRecordingUpload,
  estimateRecordingStorage,
  getDebateRecordingUpload,
  isStorageQuotaError,
  requestPersistentRecordingStorage,
} from '~/core/debates/recording-upload-queue';
import { createLocalServerClock, synchronizeServerClock } from '~/core/debates/server-clock';
import { useSetThankingDebate } from '~/core/debates/thanking-debate-store';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { Text } from '~/design-system/text';

type DebateRoomPageClientProps = {
  spaceId: string;
  debateId: string;
};

type DebateNoiseFilterStatus = 'initializing' | 'enabled' | 'disabled' | 'unsupported' | 'failed';

type DebateRoomConnectionConflictSource = 'web_lock_blocked' | 'ownership_released' | 'livekit_duplicate_identity';
type LocalTrackPreferences = { audioEnabled: boolean; videoEnabled: boolean };
type DebateRoomConnectionStage =
  | 'livekit_token'
  | 'sdk_import'
  | 'audio_output'
  | 'livekit_connect'
  | 'mark_joined'
  | 'local_tracks'
  | 'publish_tracks'
  | 'noise_filter'
  | 'local_preview';

/**
 * Stages that only run once `markJoined` has succeeded. Failing here means the server counts this
 * participant as present — it will start the debate and stop timing the pair out — while this tab
 * holds no media, so the connecting-deadline rematch can no longer rescue us. Recovery has to come
 * from this client re-running `connect`.
 */
const debateRoomStagesAfterJoin: ReadonlySet<DebateRoomConnectionStage> = new Set([
  // `mark_joined` itself is in the set: a client-side timeout can land after the server recorded
  // the join, and a spurious retry costs one request while a missing one strands the participant.
  'mark_joined',
  'local_tracks',
  'publish_tracks',
  'noise_filter',
  'local_preview',
]);

/** One silent re-attempt after a post-join failure; beyond that a repeating camera error would spin. */
const maxAutomaticPostJoinRecoveries = 1;
/** A device that just reported itself busy usually still is a moment later; give it a beat. */
const postJoinRecoveryDelayMs = 750;

const debateNoiseFilterStatusLabel: Record<DebateNoiseFilterStatus, string> = {
  initializing: 'Loading…',
  enabled: 'On',
  disabled: 'Off',
  unsupported: 'Unavailable',
  failed: 'Failed',
};

type RemoteTrackLike = {
  kind: string;
  attach: () => HTMLElement;
  detach: () => HTMLMediaElement[];
};

type RoomLike = {
  connect: (url: string, token: string, options?: RoomConnectOptions) => Promise<void>;
  disconnect: () => void;
  localParticipant: {
    publishTrack: (track: unknown) => Promise<unknown>;
  };
  on: (event: string, callback: (payload: unknown) => void) => void;
};

type DebateCountdown = {
  label: string;
  remainingSeconds: number;
  progress: number;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
  elapsedMs: number;
  yieldingSlot: ParticipantSlot | null;
  incomingSlot: ParticipantSlot | null;
  yieldedRemainingSeconds: number | null;
  yieldedProgress: number | null;
  preservesExistingCountIn: boolean;
};

type PendingTurnYield = {
  turnIndex: number;
  participantSlot: ParticipantSlot;
  endedAtMs: number;
};

type DebateRecordingWindow = {
  startAtMs: number;
  endAtMs: number;
};

const recordingOverlayTextShadow = {
  textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px #000',
};

// Label/phrase overlays in Figma are dark text with a white outline (the inverse of the big
// numbers and "GO!", which stay white-on-black via recordingOverlayTextShadow).
const recordingLabelTextShadow = {
  textShadow: '-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 4px 12px rgba(0,0,0,0.25)',
};

const debateThankingDurationMs = 20_000;
const debatePreflightDurationMs = 5_000;
const connectionFailureRedirectDelayMs = 750;
const maximumBrowserTimeoutMs = 2_147_483_647;

export function DebateRoomPageClient({ spaceId, debateId }: DebateRoomPageClientProps) {
  // GEO-2599. The debate-again picker's All tab waits on the claim-space allowlist, which walks the
  // Root space's topic tree — about thirteen sequential round trips on a cold cache, and the tab is
  // empty until it lands. Being in the room says the picker is minutes away, so the traversal runs
  // now, against a viewer who is watching a debate rather than waiting on a list.
  //
  // Here rather than in `DebateCoordinator`: that is mounted on every page in the app, and the query
  // source this needs pulls a smart-account resolver into all of them.
  usePrefetchClaimSpaceAllowlist(true);

  return (
    <DebateMediaSessionBoundary>
      <DebateRoomSurface spaceId={spaceId} debateId={debateId} />
    </DebateMediaSessionBoundary>
  );
}

function DebateRoomSurface({ spaceId, debateId }: DebateRoomPageClientProps) {
  const router = useRouter();
  const mediaSession = useDebateMediaSession();
  const mediaSessionKey = debateMediaSessionKey(debateId);
  const {
    previewState,
    previewBusy,
    previewError,
    previewStream,
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    selectedAudioInputId,
    selectedAudioOutputId,
    selectedVideoInputId,
    audioOutputSupported,
    audioOutputError,
    localTracksRef,
    localMediaStreamRef,
    selectedAudioInputIdRef,
    selectedAudioOutputIdRef,
    selectedVideoInputIdRef,
    audioOutputSupportedRef,
    audioOutputSelectionPromiseRef,
    beginSession,
    releaseSession,
    setPreviewStream,
    ensurePreview: ensureLocalPreview,
    changeAudioInput,
    changeAudioOutput,
    changeVideoInput,
  } = mediaSession;
  const debateQuery = useDebate(debateId, true);
  const refetchDebate = debateQuery.refetch;
  const liveKitJoin = useLiveKitJoin(debateId);
  const markJoined = useMarkDebateJoined(debateId);
  const markReady = useMarkDebateReady(debateId);
  const abortDebate = useAbortDebate(debateId);
  const endDebateTurn = useEndDebateTurn(debateId);
  const clearDebateActivity = useClearDebateActivity();
  const clearTimedOutDebateActivity = useClearTimedOutDebateActivity();
  const consentToRematch = useConsentToDebateRematch(debateId);
  const [joinResponse, setJoinResponse] = React.useState<LiveKitJoinResponse | null>(null);
  const [roomState, setRoomState] = React.useState<'idle' | 'connecting' | 'reconnecting' | 'connected' | 'saving'>(
    'idle'
  );
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [postJoinConnectionFailure, setPostJoinConnectionFailure] = React.useState(false);
  const [connectionConflictSource, setConnectionConflictSource] =
    React.useState<DebateRoomConnectionConflictSource | null>(null);
  const [remoteVideoReady, setRemoteVideoReady] = React.useState(false);
  const [rematchConsentRequested, setRematchConsentRequested] = React.useState(false);
  const [recordingRemovalAcknowledged, setRecordingRemovalAcknowledged] = React.useState(false);
  const [audioMuted, setAudioMuted] = React.useState(false);
  const [pendingTurnYield, setPendingTurnYield] = React.useState<PendingTurnYield | null>(null);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = React.useState(true);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const [serverClock, setServerClock] = React.useState(createLocalServerClock);
  const [serverClockSettled, setServerClockSettled] = React.useState(false);
  const [noiseFilterStatus, setNoiseFilterStatus] = React.useState<DebateNoiseFilterStatus>('initializing');
  const [noiseFilterTogglePending, setNoiseFilterTogglePending] = React.useState(false);
  const noiseFilterProcessorRef = React.useRef<KrispNoiseFilterProcessor | null>(null);
  const noiseFilterEnabledRef = React.useRef(true);
  const noiseFilterTogglePendingRef = React.useRef(false);
  const sourceMediaStreamTracksRef = React.useRef(new WeakMap<LocalTrackLike, MediaStreamTrack>());
  const mountedRef = React.useRef(true);
  const connectionGenerationRef = React.useRef(0);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteMediaRef = React.useRef<HTMLDivElement>(null);
  /**
   * The remote tracks currently subscribed, so a reconnect can put them back on screen.
   *
   * GEO-2602. `Reconnecting` clears the remote tiles, and the code assumed the tracks would
   * arrive again as fresh `TrackSubscribed` events. They do not: LiveKit reconnects by ICE
   * restart and the existing subscriptions survive it, so nothing re-fires and nothing
   * re-attaches. Kept here rather than read back off the SDK because `RoomLike` is deliberately
   * a narrow surface over the parts of LiveKit this room uses.
   */
  const subscribedRemoteTracksRef = React.useRef<Set<RemoteTrackLike>>(new Set());
  const remoteAudioEnabledRef = React.useRef(remoteAudioEnabled);
  const roomRef = React.useRef<RoomLike | null>(null);
  const connectingRoomRef = React.useRef<RoomLike | null>(null);
  // Marks the start of an in-flight LiveKit reconnect episode so telemetry can report how long
  // recovery took (Reconnected) or how long we retried before giving up (Disconnected). Episodes
  // ended by our own teardown (leave, takeover, unmount) close no analytics event, so
  // debate_room_reconnecting counts can exceed the sum of the two closing events.
  const reconnectingStartedAtRef = React.useRef<number | null>(null);
  // One auto-takeover per focus episode: spent when an attempt fires, re-armed only when the tab
  // genuinely loses attention (or the conflict resolves). Generation numbers can't dedupe here —
  // connect() bumps the generation as its first statement, so any recorded value is stale
  // immediately. The in-flight flag additionally keeps overlapping attempts from superseding each
  // other's connection generation mid-handshake.
  const autoTakeoverSpentRef = React.useRef(false);
  const autoTakeoverInFlightRef = React.useRef(false);
  const ownershipRef = React.useRef<DebateRoomOwnershipCoordinator | null>(null);
  const connectionInstanceIdRef = React.useRef('uncoordinated');
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const recordingEndedAtRef = React.useRef<number | null>(null);
  const recordingStartTimerRef = React.useRef<number | null>(null);
  const recordingStopTimerRef = React.useRef<number | null>(null);
  const autoConnectAttemptedRef = React.useRef<string | null>(null);
  const postJoinRecoveryAttemptsRef = React.useRef(0);
  const postJoinRecoveryTimerRef = React.useRef<number | null>(null);
  const connectRef = React.useRef<(options?: { takeover?: boolean }) => Promise<void>>(() => Promise.resolve());
  const connectionFailureHandledRef = React.useRef(false);
  const reportedConflictGenerationRef = React.useRef<number | null>(null);
  const reportedRecoveryGenerationRef = React.useRef<number | null>(null);
  const connectionFailureRedirectTimerRef = React.useRef<number | null>(null);
  const remoteParticipantRefetchTimerRef = React.useRef<number | null>(null);
  const serverNowRef = React.useRef(serverClock.now);
  const preflightEndsAtMsRef = React.useRef<number | null>(null);
  const finalizedDebateRef = React.useRef<string | null>(null);
  const debateExitStartedRef = React.useRef(false);
  const recordingPersistenceStartedRef = React.useRef<string | null>(null);
  const recordingPersistencePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const persistedRecordingDebateIdRef = React.useRef<string | null>(null);
  const stoppedRecordingRef = React.useRef<{
    blob: Blob;
    mimeType: string;
    startedAtMs: number;
    endedAtMs: number;
    durationSeconds: number;
    width: number | null;
    height: number | null;
    framerate: number | null;
    videoBitsPerSecond: number | null;
  } | null>(null);
  const storagePersistenceRequestedRef = React.useRef(false);
  const recordingCancellationHandledRef = React.useRef<string | null>(null);
  const recordingDiscardedRef = React.useRef<string | null>(null);
  const debate = debateQuery.data ?? null;
  const countdownDebate = debate ? debateWithPendingYield(debate, pendingTurnYield) : null;
  preflightEndsAtMsRef.current = timestampMs(debate?.preflight_ends_at ?? null);
  const debateStatusRef = React.useRef<Debate['status'] | null>(debate?.status ?? null);
  const roomStateRef = React.useRef(roomState);
  roomStateRef.current = roomState;
  const rematchQuery = useDebateRematch(
    debate?.rematch_session_id ?? '',
    Boolean(debate?.rematch_session_id) && debate?.status !== 'cancelled'
  );
  const leaveRematch = useLeaveDebateRematch(debate?.rematch_session_id ?? '');
  const countdown = useDebateCountdown(countdownDebate, serverClock.now);
  debateStatusRef.current = countdown.effectiveStatus;
  const currentUserId = getCurrentGeoChatUserId();
  const preScreenLocalParticipant =
    debate?.participants.find(participant => participant.user_id === currentUserId) ?? debate?.participants[0] ?? null;
  const preScreenRemoteParticipant =
    debate?.participants.find(participant => participant.user_id !== preScreenLocalParticipant?.user_id) ?? null;
  const localSlot = joinResponse?.participant_slot ?? null;
  const recordingCancelledBy = debate?.recording_cancelled_by ?? null;
  const opponentCancelledRecording = recordingCancelledBy !== null && recordingCancelledBy !== currentUserId;
  const recordingCanceller =
    recordingCancelledBy !== null
      ? (debate?.participants.find(participant => participant.user_id === recordingCancelledBy) ?? null)
      : null;
  // Declining to publish the recording and wanting another debate are unrelated choices, so a
  // rematch outlives the cancellation instead of being torn down with it. A session that has
  // already ended or expired is not worth holding the room open for.
  //
  // An unloaded session is neither alive nor dead, and the two readings fail in opposite
  // directions: treating it as dead tears the room down under the viewer on every cold load,
  // treating it as alive strands them on a dead screen when it resolves to expired. So rendering
  // takes the optimistic read and keeps the room up, while `rematchOutcomeResolved` holds the
  // teardown back until the answer is real.
  const rematchSessionStatus = rematchQuery.data?.status ?? null;
  const rematchQueryFailed = (rematchQuery.error ?? null) !== null;
  const rematchOutcomeResolved =
    !debate?.rematch_session_id || rematchSessionStatus !== null || rematchQueryFailed;
  const rematchSurvivesCancellation =
    Boolean(debate?.rematch_session_id) &&
    !rematchQueryFailed &&
    !['ended', 'expired'].includes(rematchSessionStatus ?? 'deciding');

  // Publish opt-out in the global upload banner is only offered while the user is on this
  // debate's thank-you screen, so tell the banner which debate that is.
  const setThankingDebate = useSetThankingDebate();
  const locallyThanking = countdown.effectiveStatus === 'thanking' && countdown.remainingSeconds > 0;
  const thankingDebateId =
    debate && (locallyThanking || isDebateInThankYouPeriod(debate, serverClock.now())) ? debate.id : null;
  const thankingHasUploadedRecording = Boolean(thankingDebateId && debate?.recordings.length);
  const thankingRecordingCancelled = Boolean(thankingDebateId && debate?.recording_cancelled_at);
  const thankingHasPendingLocalRecording = Boolean(
    thankingDebateId &&
    !thankingHasUploadedRecording &&
    !thankingRecordingCancelled &&
    (recordingStartedAtRef.current !== null || recordingPersistenceStartedRef.current === thankingDebateId)
  );
  // The global coordinator is a sibling of this page. Publish its state in a layout effect so the
  // upload banner joins the rematch card in the same browser paint at the countdown boundary.
  React.useLayoutEffect(() => {
    setThankingDebate(
      thankingDebateId
        ? {
            debateId: thankingDebateId,
            hasPendingLocalRecording: thankingHasPendingLocalRecording,
            hasUploadedRecording: thankingHasUploadedRecording,
            recordingCancelled: thankingRecordingCancelled,
          }
        : null
    );
  }, [
    setThankingDebate,
    thankingDebateId,
    thankingHasPendingLocalRecording,
    thankingHasUploadedRecording,
    thankingRecordingCancelled,
  ]);
  React.useLayoutEffect(() => () => setThankingDebate(null), [setThankingDebate]);
  const localAudioEnabled = shouldEnableLocalAudio(
    debate ? countdown.effectiveStatus : null,
    countdown.activeSlot,
    localSlot,
    audioMuted || pendingTurnYield !== null
  );
  // `connect` publishes tracks after several awaits, by which time the debate may have advanced a
  // turn. Reading preferences through a ref keeps that write consistent with the reconciliation
  // effect below, which can otherwise run first against a still-empty `localTracksRef` and be
  // silently overwritten with a stale value. The slot is passed in because `connect` learns it from
  // the join token before `joinResponse` state has necessarily re-rendered.
  const localTrackPreferencesRef = React.useRef<(slot: ParticipantSlot | null) => LocalTrackPreferences>(() => ({
    audioEnabled: false,
    videoEnabled: true,
  }));
  localTrackPreferencesRef.current = slot => ({
    audioEnabled: shouldEnableLocalAudio(
      debate ? countdown.effectiveStatus : null,
      countdown.activeSlot,
      slot,
      audioMuted || pendingTurnYield !== null
    ),
    videoEnabled,
  });
  const connectionConflict = connectionConflictSource !== null;
  const canTakeOverConnection =
    connectionConflict && (countdown.effectiveStatus === 'connecting' || countdown.effectiveStatus === 'preflight');
  const connectionConflictWithoutTakeover = connectionConflict && !canTakeOverConnection;
  // A post-join media failure keeps the retry reachable after the debate leaves `connecting` —
  // that is the one case where nothing on the server side will recover the participant for us.
  const canRetryConnection =
    Boolean(debate) &&
    !['complete', 'cancelled', 'thanking'].includes(debate?.status ?? '') &&
    (debate?.status === 'connecting' || postJoinConnectionFailure);
  const shouldExitTerminalDebate = Boolean(
    debate &&
    recordingCancelledBy === null &&
    ((debate.status === 'complete' && !debate.rematch_session_id) ||
      (debate.status === 'cancelled' && debate.cancellation_reason !== 'connection_timeout'))
  );
  const shouldReturnFromTerminalDebate = shouldExitTerminalDebate && roomState === 'idle';
  // A completed debate with a live rematch session is a dead end while the room is idle:
  // DebateCoordinator defers to this page so the recording finalizes first, but finalization only
  // runs with a live connection, and an idle room has nothing left to save. Mobile reaches this
  // whenever a backgrounded tab drops the call or remounts.
  const idleRematchDestination =
    debate?.status === 'complete' && debate.rematch_session_id && roomState === 'idle'
      ? rematchDestination(rematchQuery.data)
      : null;
  const hasRecordingPersistenceError = Boolean(
    debate &&
    debate.status === 'complete' &&
    finalizedDebateRef.current === debate.id &&
    roomState === 'connected' &&
    roomError
  );
  const shouldHideTerminalDebate =
    (shouldExitTerminalDebate && !hasRecordingPersistenceError) ||
    (recordingCancelledBy !== null && !opponentCancelledRecording && !rematchSurvivesCancellation) ||
    idleRematchDestination !== null;

  const returnFromDebate = React.useCallback(
    ({ forwardOnly = false }: { forwardOnly?: boolean } = {}) => {
      if (debateExitStartedRef.current) return;
      debateExitStartedRef.current = true;
      clearDebateActivity(debateId);
      const returnDestination = consumeDebateReturnDestination();
      if (returnDestination) {
        router.replace(returnDestination);
        return;
      }
      // Going back restores whatever opened the room, which is where an ordinary exit belongs.
      // A debate that ended under us is different: the entry behind us is often this same room
      // (hub → room → rematch → room), and stepping back into it re-runs the exit from a fresh
      // mount. That is the flicker, and it is why the removal dialog needed a second Okay.
      if (!forwardOnly && window.history.length > 1) {
        router.back();
        return;
      }
      router.replace(`/space/${spaceId}/debates`);
    },
    [clearDebateActivity, debateId, router, spaceId]
  );

  /** The exit for a debate whose recording was cancelled — it can never be re-entered. */
  const leaveCancelledDebate = React.useCallback(() => returnFromDebate({ forwardOnly: true }), [returnFromDebate]);

  /**
   * Dismissing the removal notice when a rematch outlived the cancellation. The opponent is told
   * the recording is gone and then put back on the thank-you screen, because the debate they
   * agreed to is still there to accept.
   */
  const acknowledgeRecordingRemoval = React.useCallback(() => setRecordingRemovalAcknowledged(true), []);

  const leaveConflictingRoom = React.useCallback(() => {
    const returnDestination = consumeDebateReturnDestination();
    if (returnDestination) {
      router.replace(returnDestination);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(`/space/${spaceId}/debates`);
  }, [router, spaceId]);

  React.useEffect(() => {
    serverNowRef.current = serverClock.now;
  }, [serverClock]);

  React.useEffect(() => {
    setLocalTrackPreferences(
      localTracksRef.current,
      { audioEnabled: localAudioEnabled, videoEnabled },
      sourceMediaStreamTracksRef.current
    );
  }, [localAudioEnabled, videoEnabled]);

  React.useEffect(() => {
    if (!pendingTurnYield) return;
    if (
      debate?.turn_yields?.some(turnYield => turnYield.turn_index === pendingTurnYield.turnIndex) ||
      debate?.status === 'thanking'
    ) {
      setPendingTurnYield(null);
    }
  }, [debate?.status, debate?.turn_yields, pendingTurnYield]);

  React.useEffect(() => {
    remoteAudioEnabledRef.current = remoteAudioEnabled;
    setRemoteMediaAudioEnabled(remoteMediaRef, remoteAudioEnabled);
  }, [remoteAudioEnabled]);

  const reportConnectionConflict = React.useCallback(
    (
      generation: number,
      source: DebateRoomConnectionConflictSource,
      coordinationMode: DebateRoomOwnershipCoordinationMode
    ) => {
      if (reportedConflictGenerationRef.current === generation) return;
      reportedConflictGenerationRef.current = generation;
      captureDebateRoomConnectionEvent('debate_room_connection_conflict', {
        debateId,
        source,
        coordinationMode,
        debateStatus: debateStatusRef.current,
        roomState: roomStateRef.current,
      });
    },
    [debateId]
  );

  const reportLocalReleaseRecovery = React.useCallback(
    (generation: number, coordinationMode: DebateRoomOwnershipCoordinationMode) => {
      if (reportedRecoveryGenerationRef.current === generation) return;
      reportedRecoveryGenerationRef.current = generation;
      captureDebateRoomConnectionEvent('debate_room_ownership_recovered', {
        debateId,
        coordinationMode,
        debateStatus: debateStatusRef.current,
        roomState: roomStateRef.current,
        waitedForLocalRelease: true,
      });
    },
    [debateId]
  );

  React.useEffect(() => {
    if (!currentUserId) return;
    const coordinator = createDebateRoomOwnershipCoordinator({
      debateId,
      userId: currentUserId,
      onTakeoverRequested: ({ requesterPriority, ownerPriority }) => {
        const status = debateStatusRef.current;
        const preflightStillPending =
          status === 'preflight' &&
          recordingStartedAtRef.current === null &&
          (preflightEndsAtMsRef.current === null || serverNowRef.current() < preflightEndsAtMsRef.current);
        // A focused tab may pull the connection from an unfocused one while nothing has been
        // recorded yet. Once recording starts the owner keeps the room: releasing would tear down
        // an in-flight MediaRecorder, which cannot finish persisting inside the takeover budget.
        // The status gate also protects live debates whose recording never managed to start
        // (recordingStartedAtRef stays null when MediaRecorder is unavailable).
        const focusHandoff =
          requesterPriority === 2 &&
          ownerPriority < 2 &&
          recordingStartedAtRef.current === null &&
          (status === 'connecting' || status === 'preflight');
        const canReleaseOwnership = status === 'connecting' || preflightStillPending || focusHandoff;
        if (!canReleaseOwnership) return false;

        const generation = connectionGenerationRef.current + 1;
        connectionGenerationRef.current = generation;
        disconnectConnectingRoom(connectingRoomRef);
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setConnectionConflictSource('ownership_released');
        setRoomError('This debate moved to another tab.');
        setRoomState('idle');
        logDebateConnectionDiagnostic('ownership-released', {
          debateId,
          instanceId: connectionInstanceIdRef.current,
          roomState: roomStateRef.current,
        });
        reportConnectionConflict(
          generation,
          'ownership_released',
          ownershipRef.current?.coordinationMode ?? 'livekit-fallback'
        );
        return true;
      },
    });
    connectionInstanceIdRef.current = coordinator.instanceId;
    ownershipRef.current = coordinator;

    return () => {
      if (ownershipRef.current === coordinator) ownershipRef.current = null;
      coordinator.close();
    };
  }, [currentUserId, debateId, reportConnectionConflict]);

  const clearRecordingTimers = React.useCallback(() => {
    if (recordingStartTimerRef.current !== null) {
      window.clearTimeout(recordingStartTimerRef.current);
      recordingStartTimerRef.current = null;
    }
    if (recordingStopTimerRef.current !== null) {
      window.clearTimeout(recordingStopTimerRef.current);
      recordingStopTimerRef.current = null;
    }
  }, []);

  const startLocalRecorder = React.useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') return;
    if (recordingStartedAtRef.current !== null) return;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
    const mimeType = preferredRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordingChunksRef.current = [];
    recordingEndedAtRef.current = null;
    recorder.addEventListener(
      'start',
      () => {
        recordingStartedAtRef.current = serverNowRef.current();
      },
      { once: true }
    );
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };
    recorder.start(1_000);
    recorderRef.current = recorder;
  }, []);

  const stopLocalRecorder = React.useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recordingEndedAtRef.current !== null) return;

    const stopped = new Promise<void>(resolve => {
      recorder.addEventListener(
        'stop',
        () => {
          recordingEndedAtRef.current = serverNowRef.current();
          resolve();
        },
        { once: true }
      );
    });
    if (recorder.state !== 'inactive') {
      recorder.requestData();
      recorder.stop();
      await stopped;
      return;
    }
    recordingEndedAtRef.current = serverNowRef.current();
  }, []);

  const performStoppedLocalRecordingPersistence = React.useCallback(async () => {
    if (persistedRecordingDebateIdRef.current === debate?.id) return true;

    const localParticipant =
      debate?.participants.find(participant => participant.participant_slot === joinResponse?.participant_slot) ??
      debate?.participants.find(participant => participant.user_id === currentUserId) ??
      null;
    if (!localParticipant || !debate) return false;

    const backendRecordingExists = debate.recordings.some(recording => recording.user_id === localParticipant.user_id);
    const queuedRecording = backendRecordingExists
      ? undefined
      : await getDebateRecordingUpload(debateRecordingUploadId(localParticipant.user_id, debate.id));
    if (backendRecordingExists || queuedRecording) {
      persistedRecordingDebateIdRef.current = debate.id;
      return true;
    }

    await stopLocalRecorder();

    const recorder = recorderRef.current;
    const startedAtMs = recordingStartedAtRef.current;
    const endedAtMs = recordingEndedAtRef.current;
    if (!recorder || !startedAtMs || !endedAtMs) return false;

    if (!stoppedRecordingRef.current) {
      const mimeType = recorder.mimeType || preferredRecordingMimeType() || 'video/webm';
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      if (blob.size === 0) return false;
      const videoSettings = localMediaStreamRef.current?.getVideoTracks()[0]?.getSettings?.();
      stoppedRecordingRef.current = {
        blob,
        mimeType,
        startedAtMs,
        endedAtMs,
        durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1_000)),
        width: videoSettings?.width ?? null,
        height: videoSettings?.height ?? null,
        framerate: videoSettings?.frameRate ?? null,
        videoBitsPerSecond: recorder.videoBitsPerSecond || null,
      };
    }

    const recording = stoppedRecordingRef.current;
    const storage = await estimateRecordingStorage();
    if (storage?.quota !== undefined && storage.usage !== undefined) {
      const availableBytes = storage.quota - storage.usage;
      if (availableBytes < recording.blob.size) {
        console.warn('[DebateRecording] browser storage estimate is below recording size', {
          availableBytes,
          recordingBytes: recording.blob.size,
        });
      }
    }

    try {
      await enqueueDebateRecordingUpload({
        userId: localParticipant.user_id,
        debateId: debate.id,
        blob: recording.blob,
        mimeType: recording.mimeType,
        startedAtMs: recording.startedAtMs,
        endedAtMs: recording.endedAtMs,
        durationSeconds: recording.durationSeconds,
        width: recording.width,
        height: recording.height,
        framerate: recording.framerate,
        videoBitsPerSecond: recording.videoBitsPerSecond,
      });
    } catch (error) {
      if (isStorageQuotaError(error)) {
        throw new Error(
          'There is not enough browser storage to save this recording. Free some device storage, then retry.'
        );
      }
      throw error;
    }

    persistedRecordingDebateIdRef.current = debate.id;
    recorderRef.current = null;
    recordingChunksRef.current = [];
    stoppedRecordingRef.current = null;
    recordingStartedAtRef.current = null;
    recordingEndedAtRef.current = null;
    return true;
  }, [currentUserId, debate, joinResponse?.participant_slot, stopLocalRecorder]);

  const persistStoppedLocalRecording = React.useCallback(() => {
    if (persistedRecordingDebateIdRef.current === debate?.id) return Promise.resolve(true);
    if (recordingPersistencePromiseRef.current) return recordingPersistencePromiseRef.current;
    const persistence = performStoppedLocalRecordingPersistence().finally(() => {
      recordingPersistencePromiseRef.current = null;
    });
    recordingPersistencePromiseRef.current = persistence;
    return persistence;
  }, [debate?.id, performStoppedLocalRecordingPersistence]);

  const persistRecordingAfterCapture = React.useCallback(() => {
    if (!debate || recordingPersistenceStartedRef.current === debate.id) return;
    recordingPersistenceStartedRef.current = debate.id;
    void persistStoppedLocalRecording()
      .then(persisted => {
        if (!persisted) recordingPersistenceStartedRef.current = null;
      })
      .catch(error => {
        recordingPersistenceStartedRef.current = null;
        setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
      });
  }, [debate, persistStoppedLocalRecording]);

  const discardLocalRecorder = React.useCallback(async () => {
    clearRecordingTimers();
    const recorder = recorderRef.current;
    if (!recorder) {
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = null;
      recordingEndedAtRef.current = null;
      stoppedRecordingRef.current = null;
      recordingPersistenceStartedRef.current = null;
      recordingPersistencePromiseRef.current = null;
      persistedRecordingDebateIdRef.current = null;
      return;
    }

    const stopped = new Promise<void>(resolve => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });
    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }
    recorderRef.current = null;
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = null;
    recordingEndedAtRef.current = null;
    stoppedRecordingRef.current = null;
    recordingPersistenceStartedRef.current = null;
    recordingPersistencePromiseRef.current = null;
    persistedRecordingDebateIdRef.current = null;
  }, [clearRecordingTimers]);

  const initializeNoiseFilter = React.useCallback(async (tracks: LocalTrackLike[], isCurrent: () => boolean) => {
    noiseFilterProcessorRef.current = null;
    if (isCurrent()) {
      setNoiseFilterStatus('initializing');
      setNoiseFilterTogglePending(false);
      noiseFilterTogglePendingRef.current = false;
    }

    const audioTrack = tracks.find(track => track.mediaStreamTrack.kind === 'audio');
    if (!audioTrack?.setProcessor) {
      if (isCurrent()) setNoiseFilterStatus('failed');
      console.warn('[DebateNoiseFilter] Krisp could not attach because the local microphone track is unavailable.');
      return;
    }

    let processor: KrispNoiseFilterProcessor | null = null;
    let processorAttached = false;
    try {
      const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
      if (!isCurrent()) return;
      if (!isKrispNoiseFilterSupported()) {
        setNoiseFilterStatus('unsupported');
        console.info('[DebateNoiseFilter] Krisp is unavailable in this browser; using the browser microphone track.');
        return;
      }

      const sourceMediaStreamTrack = audioTrack.mediaStreamTrack;
      sourceMediaStreamTracksRef.current.set(audioTrack, sourceMediaStreamTrack);
      processor = KrispNoiseFilter();
      await audioTrack.setProcessor(processor);
      processorAttached = true;
      if (!isCurrent()) {
        await audioTrack.stopProcessor?.().catch(stopError => {
          console.warn('[DebateNoiseFilter] Krisp cleanup failed after the connection changed.', stopError);
        });
        return;
      }
      audioTrack.mediaStreamTrack.enabled = sourceMediaStreamTrack.enabled;
      await processor.setEnabled(noiseFilterEnabledRef.current);
      if (!isCurrent()) {
        await audioTrack.stopProcessor?.().catch(stopError => {
          console.warn('[DebateNoiseFilter] Krisp cleanup failed after the connection changed.', stopError);
        });
        return;
      }

      noiseFilterProcessorRef.current = processor;
      setNoiseFilterStatus(noiseFilterEnabledRef.current ? 'enabled' : 'disabled');
    } catch (error) {
      const cleanup = processorAttached ? audioTrack.stopProcessor?.() : processor?.destroy();
      await cleanup?.catch(stopError => {
        console.warn('[DebateNoiseFilter] Krisp cleanup failed after initialization.', stopError);
      });
      if (isCurrent()) {
        noiseFilterProcessorRef.current = null;
        setNoiseFilterStatus('failed');
      }
      console.warn('[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.', error);
    }
  }, []);

  const connect = React.useCallback(
    async (options: { takeover?: boolean } = {}) => {
      const generation = connectionGenerationRef.current + 1;
      connectionGenerationRef.current = generation;
      const connectionStartedAt = performance.now();
      let connectionStage: DebateRoomConnectionStage = 'livekit_token';
      const isCurrent = () => mountedRef.current && connectionGenerationRef.current === generation;
      let connectingRoom: RoomLike | null = null;
      let newlyCreatedTracks: LocalTrackLike[] = [];
      const ownership = ownershipRef.current;
      let ownsConnection: boolean | undefined;
      let waitedForLocalRelease = false;
      if (options.takeover) {
        ownsConnection = await ownership?.requestTakeover();
      } else {
        const acquisition = await ownership?.acquire();
        ownsConnection = acquisition?.acquired;
        waitedForLocalRelease = acquisition?.waitedForLocalRelease ?? false;
      }
      if (!isCurrent()) return;
      if (ownsConnection && waitedForLocalRelease) {
        reportLocalReleaseRecovery(generation, ownership?.coordinationMode ?? 'livekit-fallback');
      }
      if (ownsConnection === false) {
        setConnectionConflictSource('web_lock_blocked');
        setRoomError('This debate is already open in another tab.');
        setRoomState('idle');
        logDebateConnectionDiagnostic('ownership-blocked', {
          debateId,
          instanceId: connectionInstanceIdRef.current,
          roomState: roomStateRef.current,
        });
        reportConnectionConflict(generation, 'web_lock_blocked', ownership?.coordinationMode ?? 'livekit-fallback');
        return;
      }

      setConnectionConflictSource(null);
      setRoomError(null);
      setPostJoinConnectionFailure(false);
      setRoomState('connecting');
      setServerClockSettled(false);
      setRemoteVideoReady(false);
      reconnectingStartedAtRef.current = null;
      if (remoteParticipantRefetchTimerRef.current !== null) {
        window.clearTimeout(remoteParticipantRefetchTimerRef.current);
        remoteParticipantRefetchTimerRef.current = null;
      }
      remoteMediaRef.current?.replaceChildren();
      subscribedRemoteTracksRef.current.clear();
      void synchronizeServerClock(getServerTime)
        .then(clock => {
          if (isCurrent()) setServerClock(clock);
        })
        .catch(() => null)
        .finally(() => {
          if (isCurrent()) setServerClockSettled(true);
        });

      try {
        const token = await liveKitJoin.mutateAsync();
        if (!isCurrent()) return;
        setJoinResponse(token);

        connectionStage = 'sdk_import';
        const livekit = await import('livekit-client');
        if (!isCurrent()) return;
        connectionStage = 'audio_output';
        await audioOutputSelectionPromiseRef.current;
        if (!isCurrent()) return;
        // A debate is a live, recorded 1:1 call, so both cameras must stream the whole time.
        // adaptiveStream pauses a subscribed remote video when it judges the element off-screen or
        // too small, and dynacast stops publishing layers no one is consuming; together they black
        // out a tile mid-turn.
        const roomOptions = debateRoomOptions(audioOutputSupportedRef.current, selectedAudioOutputIdRef.current);
        const room = new livekit.Room(roomOptions) as unknown as RoomLike;
        connectingRoom = room;
        connectingRoomRef.current = room;
        const attachRemoteTrack = (track: RemoteTrackLike) => {
          const element = track.attach();
          if (element instanceof HTMLMediaElement) {
            element.muted = !remoteAudioEnabledRef.current;
          }
          if (element instanceof HTMLVideoElement) {
            element.className = 'h-full w-full object-contain';
            element.playsInline = true;
            setRemoteVideoReady(true);
          } else if (element instanceof HTMLAudioElement) {
            element.className = 'hidden';
          }
          remoteMediaRef.current?.appendChild(element);
        };
        room.on(livekit.RoomEvent.TrackSubscribed, payload => {
          // Auto-subscribe can deliver a track during room.connect(), before roomRef is assigned, so
          // reject only a different room here rather than a not-yet-set one.
          if (!isCurrent() || (roomRef.current && roomRef.current !== room)) return;
          const track = payload as RemoteTrackLike;
          subscribedRemoteTracksRef.current.add(track);
          attachRemoteTrack(track);
          void refetchDebate();
        });
        // When a remote track drops mid-debate, detach its element instead of leaving a frozen black
        // tile. Resetting remoteVideoReady flips the tile back to "Waiting for video" so a later
        // re-subscribe attaches a fresh element rather than stacking a second one behind it.
        room.on(livekit.RoomEvent.TrackUnsubscribed, payload => {
          if (!isCurrent() || (roomRef.current && roomRef.current !== room)) return;
          const track = payload as RemoteTrackLike;
          subscribedRemoteTracksRef.current.delete(track);
          for (const element of track.detach()) element.remove();
          if (track.kind === 'video') setRemoteVideoReady(false);
        });
        room.on(livekit.RoomEvent.ParticipantConnected, () => {
          if (!isCurrent()) return;
          void refetchDebate();
          remoteParticipantRefetchTimerRef.current = window.setTimeout(() => {
            remoteParticipantRefetchTimerRef.current = null;
            if (isCurrent()) void refetchDebate();
          }, 250);
        });
        // LiveKit runs its own ICE-restart reconnection; surface it so a debater whose connection
        // blips sees "Reconnecting" instead of a silently frozen call. Clear the remote
        // tiles on the way out so stale elements from the dropped session don't linger behind the
        // re-subscribed tracks.
        room.on(livekit.RoomEvent.Reconnecting, () => {
          if (!isCurrent() || roomRef.current !== room) return;
          // `detach`, not just `replaceChildren`: an element removed from the DOM keeps playing,
          // which is why GEO-2602 presented as audio-without-video rather than as silence. The
          // tracks stay in `subscribedRemoteTracksRef` because they are still subscribed — the
          // reconnect does not tear the subscription down, and `Reconnected` puts them back.
          for (const track of subscribedRemoteTracksRef.current) {
            for (const element of track.detach()) element.remove();
          }
          remoteMediaRef.current?.replaceChildren();
          setRemoteVideoReady(false);
          setRoomState('reconnecting');
          // A reconnect episode fires Reconnecting once per underlying attempt; report only the
          // first so elapsed_ms on the closing event spans the whole episode.
          if (reconnectingStartedAtRef.current === null) {
            reconnectingStartedAtRef.current = performance.now();
            captureDebateRoomResilienceEvent('debate_room_reconnecting', {
              debateId,
              debateStatus: debateStatusRef.current,
              roomState: roomStateRef.current,
            });
          }
        });
        room.on(livekit.RoomEvent.Reconnected, () => {
          if (!isCurrent() || roomRef.current !== room) return;
          // The subscriptions survived the reconnect, so nothing will re-deliver these tracks —
          // putting them back is this handler's job. Without it the opponent's tile stayed empty
          // for the rest of the debate while their audio kept playing (GEO-2602).
          //
          // Detached first because a reconnect that *did* re-subscribe has already attached a
          // fresh element, and `attach` is not guaranteed to hand back the same one twice.
          for (const track of subscribedRemoteTracksRef.current) {
            for (const stale of track.detach()) stale.remove();
            attachRemoteTrack(track);
          }
          setRoomState('connected');
          if (reconnectingStartedAtRef.current !== null) {
            captureDebateRoomResilienceEvent('debate_room_reconnected', {
              debateId,
              debateStatus: debateStatusRef.current,
              roomState: roomStateRef.current,
              elapsedMs: performance.now() - reconnectingStartedAtRef.current,
            });
            reconnectingStartedAtRef.current = null;
          }
        });
        // A Disconnected that passes these guards is never our own teardown: every in-app teardown
        // bumps the connection generation or nulls roomRef synchronously, and the SDK emits
        // Disconnected only after awaiting its internal disconnect lock (at least a microtask
        // later). That covers CLIENT_INITIATED too — the SDK registers its `freeze` listener
        // unconditionally (disconnectOnPageLeave only gates pagehide/beforeunload), so Chromium
        // freezing a backgrounded tab disconnects the room "client initiated". Treat everything
        // that lands here as a genuinely dropped call: tear the room down and return to idle,
        // where the "Retry connection" affordance lives.
        room.on(livekit.RoomEvent.Disconnected, payload => {
          if (!isCurrent() || roomRef.current !== room) return;
          const reconnectElapsedMs =
            reconnectingStartedAtRef.current !== null
              ? performance.now() - reconnectingStartedAtRef.current
              : undefined;
          reconnectingStartedAtRef.current = null;
          const conflictGeneration = connectionGenerationRef.current + 1;
          connectionGenerationRef.current = conflictGeneration;
          // The room is already gone, so null the ref before cleanup: disconnectRoom would otherwise
          // call room.disconnect() a second time and could re-enter this handler.
          roomRef.current = null;
          disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
          noiseFilterProcessorRef.current = null;
          ownershipRef.current?.release();
          localMediaStreamRef.current = null;
          setRemoteVideoReady(false);
          const duplicateIdentity = payload === livekit.DisconnectReason.DUPLICATE_IDENTITY;
          setConnectionConflictSource(duplicateIdentity ? 'livekit_duplicate_identity' : null);
          setRoomError(
            duplicateIdentity
              ? 'This debate is active in another tab or device.'
              : 'Lost connection to the debate room.'
          );
          setRoomState('idle');
          logDebateConnectionDiagnostic('livekit-disconnected', {
            debateId,
            instanceId: connectionInstanceIdRef.current,
            roomState: roomStateRef.current,
            disconnectReason: payload,
          });
          if (duplicateIdentity) {
            reportConnectionConflict(
              conflictGeneration,
              'livekit_duplicate_identity',
              ownershipRef.current?.coordinationMode ?? 'livekit-fallback'
            );
          } else {
            // Duplicate identity is already reported as a connection conflict above; everything
            // else is a genuine drop worth measuring, including how long we retried first.
            captureDebateRoomResilienceEvent('debate_room_disconnected', {
              debateId,
              debateStatus: debateStatusRef.current,
              roomState: roomStateRef.current,
              disconnectReason: disconnectReasonName(livekit.DisconnectReason, payload),
              elapsedMs: reconnectElapsedMs,
            });
          }
        });

        connectionStage = 'livekit_connect';
        // The SDK's initial-join defaults (1 retry, 15s websocket/peer-connection timeouts) are
        // marginal on slow mobile links; reconnection after a successful join is governed by the
        // reconnectPolicy in debateRoomOptions, not by these.
        await room.connect(token.url, token.token, {
          maxRetries: 3,
          websocketTimeout: 20_000,
          peerConnectionTimeout: 25_000,
        });
        if (!isCurrent()) {
          room.disconnect();
          if (connectingRoomRef.current === room) connectingRoomRef.current = null;
          return;
        }
        connectingRoomRef.current = null;
        roomRef.current = room;

        // The server's connecting deadline measures whether both participants reached LiveKit, not
        // whether camera setup and publication have finished. Report the successful room connection
        // immediately: a cold getUserMedia call can otherwise consume the entire deadline after the
        // participant is already present in the room.
        connectionStage = 'mark_joined';
        await markJoined.mutateAsync();
        if (!isCurrent()) {
          room.disconnect();
          stopLocalTracks(localTracksRef);
          localMediaStreamRef.current = null;
          if (roomRef.current === room) roomRef.current = null;
          return;
        }

        const hasPreviewTracks = localTracksRef.current.length > 0;
        connectionStage = 'local_tracks';
        const tracks = hasPreviewTracks
          ? localTracksRef.current
          : ((await livekit.createLocalTracks({
              audio: selectedAudioInputIdRef.current ? { deviceId: selectedAudioInputIdRef.current } : true,
              video: selectedVideoInputIdRef.current ? { deviceId: selectedVideoInputIdRef.current } : true,
            })) as LocalTrackLike[]);
        if (!hasPreviewTracks) newlyCreatedTracks = tracks;
        if (!isCurrent()) {
          room.disconnect();
          stopTracks(newlyCreatedTracks);
          if (roomRef.current === room) roomRef.current = null;
          return;
        }
        localTracksRef.current = tracks;
        setLocalTrackPreferences(
          tracks,
          localTrackPreferencesRef.current(token.participant_slot),
          sourceMediaStreamTracksRef.current
        );

        connectionStage = 'publish_tracks';
        for (const track of tracks) {
          await publishTrackWithRetry(room, track, isCurrent);
          if (!isCurrent()) {
            room.disconnect();
            stopLocalTracks(localTracksRef);
            localMediaStreamRef.current = null;
            if (roomRef.current === room) roomRef.current = null;
            return;
          }
        }

        // LiveKit supplies the audio context required by audio processors while publishing the
        // microphone. Attach Krisp afterwards, then read mediaStreamTrack so this stream contains
        // the same processed track used by the outbound publication.
        connectionStage = 'noise_filter';
        await initializeNoiseFilter(tracks, isCurrent);
        if (!isCurrent()) {
          room.disconnect();
          stopLocalTracks(localTracksRef);
          localMediaStreamRef.current = null;
          if (roomRef.current === room) roomRef.current = null;
          return;
        }
        connectionStage = 'local_preview';
        const stream = new MediaStream(tracks.map(track => track.mediaStreamTrack));
        setPreviewStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => undefined);
        }

        if (!isCurrent()) {
          room.disconnect();
          stopLocalTracks(localTracksRef);
          localMediaStreamRef.current = null;
          if (roomRef.current === room) roomRef.current = null;
          return;
        }
        setConnectionConflictSource(null);
        setPostJoinConnectionFailure(false);
        postJoinRecoveryAttemptsRef.current = 0;
        setRoomState('connected');
      } catch (error) {
        if (connectingRoom && connectingRoomRef.current === connectingRoom) connectingRoomRef.current = null;
        if (connectingRoom && roomRef.current !== connectingRoom) {
          connectingRoom.disconnect();
          stopTracks(newlyCreatedTracks);
        }
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        if (isCurrent()) {
          captureDebateRoomConnectionFailure({
            debateId,
            stage: connectionStage,
            elapsedMs: performance.now() - connectionStartedAt,
            error,
          });
          ownershipRef.current?.release();
          setConnectionConflictSource(null);
          setRoomError(error instanceof Error ? error.message : 'Could not join the debate room.');
          // The server already counts us as joined past this point, so it will never cancel the
          // pair with `connection_timeout` and rematch them. Keep a retry reachable even once the
          // debate has advanced out of `connecting`, and spend one silent re-attempt first.
          const failedAfterJoin = debateRoomStagesAfterJoin.has(connectionStage);
          if (failedAfterJoin) {
            setPostJoinConnectionFailure(true);
            if (postJoinRecoveryAttemptsRef.current < maxAutomaticPostJoinRecoveries) {
              postJoinRecoveryAttemptsRef.current += 1;
              // Re-run `connect` directly rather than through the auto-connect effect: that effect
              // only fires from `roomState === 'idle'`, and while the debate is still `connecting`
              // the state below stays 'connecting'. Clearing `autoConnectAttemptedRef` instead
              // would also turn every later disconnect into an automatic reconnect.
              if (postJoinRecoveryTimerRef.current !== null) window.clearTimeout(postJoinRecoveryTimerRef.current);
              postJoinRecoveryTimerRef.current = window.setTimeout(() => {
                postJoinRecoveryTimerRef.current = null;
                // A manual retry or teardown in the meantime moved the generation on; it owns the room now.
                if (!isCurrent()) return;
                const status = debateStatusRef.current;
                if (status === 'complete' || status === 'cancelled' || status === 'thanking') return;
                void connectRef.current();
              }, postJoinRecoveryDelayMs);
            }
          }
          // Read the live status: `debate` is captured from the render that built this callback, and
          // a slow media path is exactly when the debate advances underneath it. Trusting the stale
          // value leaves `roomState` on 'connecting' while the modal hides its retry button.
          setRoomState(debateStatusRef.current === 'connecting' ? 'connecting' : 'idle');
        }
      }
    },
    // Countdown state, mute state and the debate status are read through refs above, so `connect`
    // no longer changes identity on every countdown tick.
    [
      debateId,
      initializeNoiseFilter,
      liveKitJoin,
      markJoined,
      reportConnectionConflict,
      reportLocalReleaseRecovery,
      refetchDebate,
      setPreviewStream,
    ]
  );

  connectRef.current = connect;

  const retryConnection = React.useCallback(() => {
    void connect();
  }, [connect]);

  const takeOverConnection = React.useCallback(() => {
    void connect({ takeover: true });
  }, [connect]);

  // A blocked tab the user focuses reclaims the debate by itself instead of dead-ending on
  // "already open in another tab" until they find the Continue button. Limited to same-browser
  // conflict sources: reclaiming across devices (livekit_duplicate_identity) would evict a call
  // the user may be actively holding on their phone, so that stays behind the explicit click.
  React.useEffect(() => {
    if (
      roomState !== 'idle' ||
      (connectionConflictSource !== 'web_lock_blocked' && connectionConflictSource !== 'ownership_released')
    ) {
      // The conflict resolved or changed shape; the next episode gets a fresh attempt.
      autoTakeoverSpentRef.current = false;
      return;
    }
    const attemptTakeover = () => {
      if (autoTakeoverSpentRef.current || autoTakeoverInFlightRef.current) return;
      // Mirror the "Continue here" button's status gate: past preflight the owner refuses anyway
      // — or worse, hands over a live debate whose recording never managed to start.
      const status = debateStatusRef.current;
      if (status !== 'connecting' && status !== 'preflight') return;
      autoTakeoverSpentRef.current = true;
      autoTakeoverInFlightRef.current = true;
      void connectRef.current({ takeover: true }).finally(() => {
        autoTakeoverInFlightRef.current = false;
      });
    };
    const handleAttentionChange = () => {
      if (debateRoomTabPriority() !== 2) {
        // Leaving focus re-arms the next attempt; browsers that fire redundant focus or
        // visibilitychange events while the tab stays focused therefore cannot double-connect.
        autoTakeoverSpentRef.current = false;
        return;
      }
      attemptTakeover();
    };
    window.addEventListener('focus', handleAttentionChange);
    // A window losing focus to another application fires blur without any visibilitychange.
    window.addEventListener('blur', handleAttentionChange);
    document.addEventListener('visibilitychange', handleAttentionChange);
    // The conflict can land while this tab is already focused (it lost the connect race to a
    // background tab that navigated earlier); reclaim immediately rather than waiting for a
    // focus transition that will never come.
    if (debateRoomTabPriority() === 2) attemptTakeover();
    return () => {
      window.removeEventListener('focus', handleAttentionChange);
      window.removeEventListener('blur', handleAttentionChange);
      document.removeEventListener('visibilitychange', handleAttentionChange);
    };
  }, [connectionConflictSource, roomState]);

  const toggleAudioMuted = React.useCallback(() => {
    setAudioMuted(current => !current);
  }, []);

  const toggleRemoteAudioEnabled = React.useCallback(() => {
    setRemoteAudioEnabled(current => !current);
  }, []);

  const toggleVideoEnabled = React.useCallback(() => {
    setVideoEnabled(current => !current);
  }, []);

  const endLocalTurn = React.useCallback(async () => {
    if (
      !localSlot ||
      pendingTurnYield ||
      countdown.effectiveStatus !== 'in_progress' ||
      countdown.activeSlot !== localSlot ||
      countdown.turnIndex === null
    ) {
      return;
    }

    const pendingYield = {
      turnIndex: countdown.turnIndex,
      participantSlot: localSlot,
      endedAtMs: serverClock.now(),
    };
    setRoomError(null);
    setPendingTurnYield(pendingYield);
    try {
      await endDebateTurn.mutateAsync({
        turnIndex: pendingYield.turnIndex,
        endedAtMs: pendingYield.endedAtMs,
      });
    } catch (error) {
      const refreshedDebate = await refetchDebate();
      setPendingTurnYield(null);
      const authoritativeYield = refreshedDebate.data?.turn_yields?.some(
        turnYield => turnYield.turn_index === pendingYield.turnIndex
      );
      if (!authoritativeYield) {
        setRoomError(error instanceof Error ? error.message : 'Could not end the turn.');
      }
    }
  }, [
    countdown.activeSlot,
    countdown.effectiveStatus,
    countdown.turnIndex,
    endDebateTurn,
    localSlot,
    pendingTurnYield,
    refetchDebate,
    serverClock,
  ]);

  const toggleNoiseFilter = React.useCallback(async () => {
    const processor = noiseFilterProcessorRef.current;
    if (!processor || noiseFilterTogglePendingRef.current) return;

    const previousEnabled = noiseFilterEnabledRef.current;
    const enabled = !previousEnabled;
    noiseFilterEnabledRef.current = enabled;
    noiseFilterTogglePendingRef.current = true;
    setNoiseFilterTogglePending(true);
    try {
      await processor.setEnabled(enabled);
      if (!mountedRef.current || noiseFilterProcessorRef.current !== processor) return;
      setNoiseFilterStatus(enabled ? 'enabled' : 'disabled');
    } catch (error) {
      if (mountedRef.current && noiseFilterProcessorRef.current === processor) {
        noiseFilterEnabledRef.current = previousEnabled;
        setNoiseFilterStatus('failed');
      }
      console.warn('[DebateNoiseFilter] Krisp could not change state.', error);
    } finally {
      if (noiseFilterProcessorRef.current === processor) {
        noiseFilterTogglePendingRef.current = false;
        if (mountedRef.current) setNoiseFilterTogglePending(false);
      }
    }
  }, []);

  const finishAndPersist = React.useCallback(async () => {
    setRoomError(null);
    setRoomState('saving');
    try {
      const persisted = await persistStoppedLocalRecording();
      if (!persisted) {
        throw new Error('No local recording was available to save.');
      }
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
      setRemoteVideoReady(false);
      return true;
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
      setRoomState('connected');
      return false;
    }
  }, [persistStoppedLocalRecording]);

  const finishLiveDebate = React.useCallback(async () => {
    if (!debate || finalizedDebateRef.current === debate.id) return;
    const session = rematchQuery.data;
    if (debate.rematch_session_id && (!session || session.status === 'deciding')) return;
    finalizedDebateRef.current = debate.id;
    // A cancelled recording was discarded locally and deleted server-side, so there is nothing
    // left to save — but the rematch it anchored still needs its navigation.
    if (debate.recording_cancelled_at === null) {
      const persisted = await finishAndPersist();
      if (!persisted) return;
    } else {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
      setRemoteVideoReady(false);
      setRoomState('idle');
    }
    const destination = rematchDestination(session);
    if (destination) {
      router.replace(destination);
      return;
    }
    returnFromDebate();
  }, [debate, finishAndPersist, rematchQuery.data, returnFromDebate, router]);

  const retryLiveDebateFinalization = React.useCallback(() => {
    if (debate?.status === 'thanking') {
      setRoomError(null);
      setRoomState('saving');
      recordingPersistenceStartedRef.current = debate.id;
      void persistStoppedLocalRecording()
        .then(persisted => {
          if (!persisted) throw new Error('No local recording was available to save.');
          setRoomState('connected');
        })
        .catch(error => {
          recordingPersistenceStartedRef.current = null;
          setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
          setRoomState('connected');
        });
      return;
    }
    finalizedDebateRef.current = null;
    void finishLiveDebate();
  }, [debate?.id, debate?.status, finishLiveDebate, persistStoppedLocalRecording]);

  const requestRematch = React.useCallback(async () => {
    if (rematchConsentRequested) return;
    setRoomError(null);
    setRematchConsentRequested(true);
    try {
      await consentToRematch.mutateAsync();
    } catch (error) {
      setRematchConsentRequested(false);
      setRoomError(error instanceof Error ? error.message : 'Could not request another debate.');
    }
  }, [consentToRematch, rematchConsentRequested]);

  const markLocalReady = React.useCallback(async () => {
    setRoomError(null);
    try {
      await ensureLocalPreview();
      await markReady.mutateAsync();
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not mark you ready.');
    }
  }, [ensureLocalPreview, markReady]);

  const leave = React.useCallback(async () => {
    if (!debate) return;
    setRoomError(null);
    try {
      if (debate.status === 'complete') {
        await finishLiveDebate();
        return;
      } else if (debate.status === 'thanking' && debate.rematch_session_id) {
        // A cancelled recording was discarded the moment the cancellation landed, so there is
        // nothing to persist. Insisting anyway fails every time and traps someone who cancelled
        // and then decided against the rematch — the one exit they have left.
        if (debate.recording_cancelled_at === null) {
          const persisted = await persistStoppedLocalRecording();
          if (!persisted) {
            throw new Error('Could not save the local recording. Please try leaving again.');
          }
        }
        await leaveRematch.mutateAsync();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRoomState('idle');
      } else if (debate.status === 'cancelled') {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setRoomState('idle');
      } else {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        await abortDebate.mutateAsync();
      }
      returnFromDebate();
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not leave the debate.');
    }
  }, [
    abortDebate,
    debate,
    discardLocalRecorder,
    finishLiveDebate,
    leaveRematch,
    persistStoppedLocalRecording,
    returnFromDebate,
  ]);

  const handleConnectionFailure = React.useCallback(() => {
    if (connectionFailureHandledRef.current) return;
    connectionFailureHandledRef.current = true;
    connectionGenerationRef.current += 1;
    if (remoteParticipantRefetchTimerRef.current !== null) {
      window.clearTimeout(remoteParticipantRefetchTimerRef.current);
      remoteParticipantRefetchTimerRef.current = null;
    }
    clearTimedOutDebateActivity(debateId);
    clearRecordingTimers();
    void discardLocalRecorder();
    disconnectConnectingRoom(connectingRoomRef);
    disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    ownershipRef.current?.release();
    localMediaStreamRef.current = null;
    setRemoteVideoReady(false);
    setRoomError('Connection failed. Finding another match.');
    setRoomState('connecting');
  }, [clearRecordingTimers, clearTimedOutDebateActivity, debateId, discardLocalRecorder]);

  const redirectAfterConnectionFailure = React.useCallback(() => {
    if (connectionFailureRedirectTimerRef.current !== null) return;
    connectionFailureRedirectTimerRef.current = window.setTimeout(() => {
      router.replace(consumeDebateReturnDestination() ?? `/space/${spaceId}/questions`);
    }, connectionFailureRedirectDelayMs);
  }, [router, spaceId]);

  const reconcileConnectionDeadline = React.useCallback(async () => {
    const generation = connectionGenerationRef.current;
    const result = await refetchDebate().catch(() => null);
    if (!mountedRef.current || connectionGenerationRef.current !== generation) return;
    if (result?.data?.status !== 'cancelled' || result.data.cancellation_reason !== 'connection_timeout') return;
    handleConnectionFailure();
    redirectAfterConnectionFailure();
  }, [handleConnectionFailure, redirectAfterConnectionFailure, refetchDebate]);

  React.useEffect(() => {
    if (!debate || debate.status !== 'connecting') return;
    const deadline = timestampMs(debate.connecting_deadline_at);
    if (deadline === null) return;
    const remainingMs = deadline - serverClock.now();
    if (remainingMs <= 0) {
      void reconcileConnectionDeadline();
      return;
    }
    const timer = window.setTimeout(
      () => void reconcileConnectionDeadline(),
      Math.min(remainingMs, maximumBrowserTimeoutMs)
    );
    return () => window.clearTimeout(timer);
  }, [debate, reconcileConnectionDeadline, serverClock]);

  React.useEffect(() => {
    if (debate?.status === 'cancelled' && debate.cancellation_reason === 'connection_timeout') {
      handleConnectionFailure();
      redirectAfterConnectionFailure();
    }
  }, [debate?.cancellation_reason, debate?.status, handleConnectionFailure, redirectAfterConnectionFailure]);

  React.useEffect(() => {
    beginSession(mediaSessionKey);
    return () => releaseSession(mediaSessionKey);
  }, [beginSession, mediaSessionKey, releaseSession]);

  React.useEffect(() => {
    const resumingAfterEffectCleanup = !mountedRef.current;
    mountedRef.current = true;
    if (resumingAfterEffectCleanup) {
      autoConnectAttemptedRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      connectionGenerationRef.current += 1;
      if (connectionFailureRedirectTimerRef.current !== null) {
        window.clearTimeout(connectionFailureRedirectTimerRef.current);
        connectionFailureRedirectTimerRef.current = null;
      }
      if (remoteParticipantRefetchTimerRef.current !== null) {
        window.clearTimeout(remoteParticipantRefetchTimerRef.current);
        remoteParticipantRefetchTimerRef.current = null;
      }
      if (postJoinRecoveryTimerRef.current !== null) {
        window.clearTimeout(postJoinRecoveryTimerRef.current);
        postJoinRecoveryTimerRef.current = null;
      }
      clearRecordingTimers();
      void discardLocalRecorder();
      disconnectConnectingRoom(connectingRoomRef);
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
    };
  }, [clearRecordingTimers, discardLocalRecorder]);

  React.useEffect(() => {
    if (!shouldReturnFromTerminalDebate) return;
    returnFromDebate();
  }, [returnFromDebate, shouldReturnFromTerminalDebate]);

  React.useEffect(() => {
    if (!idleRematchDestination) return;
    router.replace(idleRematchDestination);
  }, [idleRematchDestination, router]);

  React.useEffect(() => {
    if (!debate || storagePersistenceRequestedRef.current) return;
    if (['complete', 'cancelled'].includes(debate.status)) return;
    storagePersistenceRequestedRef.current = true;
    void requestPersistentRecordingStorage();
  }, [debate]);

  React.useEffect(() => {
    if (!debate || debate.status !== 'ready' || roomState !== 'idle') return;
    // Warm the route's largest client-only dependency before the ten/finite-second connecting
    // window starts. The import is cached by the module loader; media preview remains independent.
    void import('livekit-client').catch(() => undefined);
    void ensureLocalPreview().catch(() => undefined);
  }, [debate, ensureLocalPreview, roomState]);

  React.useEffect(() => {
    if (!debate || roomState !== 'idle') return;
    if (connectionFailureHandledRef.current) return;
    if (['complete', 'cancelled'].includes(debate.status)) return;
    if (debate.status === 'ready') return;
    if (autoConnectAttemptedRef.current === debate.id) return;
    autoConnectAttemptedRef.current = debate.id;
    void connect();
  }, [connect, debate, roomState]);

  React.useEffect(() => {
    clearRecordingTimers();
    if (!debate || roomState !== 'connected' || !serverClockSettled) return;

    const stream = localMediaStreamRef.current;
    if (!stream) return;

    const recordingWindow = recordingWindowForDebate(debate);
    if (!recordingWindow) return;

    if (debate.status === 'thanking') {
      persistRecordingAfterCapture();
      return;
    }
    if (debate.status !== 'preflight' && debate.status !== 'in_progress') return;

    const now = serverClock.now();
    if (now >= recordingWindow.endAtMs) {
      persistRecordingAfterCapture();
      return;
    }

    if (recordingStartedAtRef.current === null) {
      recordingStartTimerRef.current = window.setTimeout(
        () => startLocalRecorder(stream),
        Math.max(0, recordingWindow.startAtMs - now)
      );
    }
    recordingStopTimerRef.current = window.setTimeout(
      () => {
        persistRecordingAfterCapture();
      },
      Math.max(0, recordingWindow.endAtMs - now)
    );

    return clearRecordingTimers;
  }, [
    clearRecordingTimers,
    debate,
    persistRecordingAfterCapture,
    roomState,
    serverClock,
    serverClockSettled,
    startLocalRecorder,
  ]);

  React.useEffect(() => {
    if (!debate) return;
    if (roomState === 'idle') return;
    if (debate.status === 'cancelled') {
      if (debate.cancellation_reason === 'connection_timeout') return;
      void discardLocalRecorder().finally(() => {
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setRoomState('idle');
      });
      return;
    }
    if (debate.status !== 'complete') return;
    if (debate.rematch_session_id && !rematchQuery.data) return;
    void finishLiveDebate();
  }, [debate, discardLocalRecorder, finishLiveDebate, rematchQuery.data, roomState]);

  React.useEffect(() => {
    if (!debate || recordingCancelledBy === null) return;
    // The recording is gone for both sides, so make sure nothing from this tab publishes the
    // local blob. This half is unconditional and runs the moment the cancellation is seen.
    if (recordingDiscardedRef.current !== debate.id) {
      recordingDiscardedRef.current = debate.id;
      if (currentUserId) {
        void deleteDebateRecordingUpload(debateRecordingUploadId(currentUserId, debate.id)).catch(() => undefined);
      }
      void discardLocalRecorder();
    }
    if (recordingCancellationHandledRef.current === debate.id) return;
    // Whether the room comes down turns on the rematch, so decide nothing until it has loaded.
    if (!rematchOutcomeResolved) return;
    // A live rematch survives the cancellation, so the thank-you screen stays up and either side
    // can still consent to another debate. `finishLiveDebate` carries them into the picker once
    // the thank-you period ends. Deliberately not marked handled: if the session later ends or
    // expires, this runs again and takes the room down then.
    if (rematchSurvivesCancellation) return;
    // With no rematch to keep, the debate really is over: block the normal finalize/redirect path
    // and tear the room down.
    recordingCancellationHandledRef.current = debate.id;
    finalizedDebateRef.current = debate.id;
    disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    localMediaStreamRef.current = null;
    setRemoteVideoReady(false);
    setRoomState('idle');
    // The canceller already saw the confirmation in the upload banner; only the opponent needs
    // the "your debate was removed" popup, so return the canceller to the debates page.
    if (!opponentCancelledRecording) {
      leaveCancelledDebate();
    }
  }, [
    currentUserId,
    debate,
    discardLocalRecorder,
    leaveCancelledDebate,
    opponentCancelledRecording,
    recordingCancelledBy,
    rematchOutcomeResolved,
    rematchSurvivesCancellation,
  ]);

  const recordingRemovalNotice =
    debate && opponentCancelledRecording && !recordingRemovalAcknowledged ? (
      <DebateRecordingRemovedDialog
        cancellerName={recordingCanceller ? speakerName(recordingCanceller) : 'Your opponent'}
        claim={debate.claim.claim}
        onAcknowledge={rematchSurvivesCancellation ? acknowledgeRecordingRemoval : leaveCancelledDebate}
      />
    ) : null;

  // With no rematch the room behind this notice is already being torn down, so it stands alone.
  // With one, it is a dialog over the thank-you screen the opponent is about to return to, and
  // returning it here instead would unmount that screen and leave the backdrop on the app shell.
  if (recordingRemovalNotice && !rematchSurvivesCancellation) return recordingRemovalNotice;

  if (shouldHideTerminalDebate) return null;

  if (connectionConflictWithoutTakeover) {
    return (
      <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8 text-center">
        <div className="flex w-full max-w-[451px] flex-col items-center">
          <Text as="h1" variant="smallTitle" color="text">
            This debate is already open in another tab.
          </Text>
          <Text as="p" variant="metadata" color="grey-04" className="mt-3">
            Close this tab and continue your debate in the original tab.
          </Text>
          <button
            type="button"
            onClick={leaveConflictingRoom}
            className="mt-6 text-ctaPrimary transition-colors hover:text-ctaHover focus-visible:text-ctaHover"
          >
            <Text as="span" variant="textLinkSemibold" color="current">
              Go back
            </Text>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      {debate?.status !== 'ready' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Text as="h2" variant="smallTitle" color="text">
              Debate room
            </Text>
            {debate && (
              <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[760px]">
                {debate.claim.claim}
              </Text>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(`/space/${spaceId}/debates`)}>
            Back to debates
          </Button>
        </div>
      )}

      {debateQuery.isLoading && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text color="grey-04">Loading debate...</Text>
        </div>
      )}

      {debateQuery.error instanceof Error && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-4">
          <Text color="red-01">{debateQuery.error.message}</Text>
        </div>
      )}

      {debate &&
        (debate.status === 'ready' ? (
          <DebatePreScreen
            claim={debate.claim.claim}
            participants={debate.participants}
            currentUserId={currentUserId}
            localReady={Boolean(preScreenLocalParticipant?.ready_at)}
            remoteReady={Boolean(preScreenRemoteParticipant?.ready_at)}
            localVideoRef={localVideoRef}
            previewStream={previewStream}
            previewState={previewState}
            previewBusy={previewBusy}
            error={roomError ?? previewError}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            videoInputDevices={videoInputDevices}
            selectedAudioInputId={selectedAudioInputId}
            selectedAudioOutputId={selectedAudioOutputId}
            selectedVideoInputId={selectedVideoInputId}
            audioOutputSupported={audioOutputSupported}
            audioOutputError={audioOutputError}
            onAudioInputChange={changeAudioInput}
            onAudioOutputChange={changeAudioOutput}
            onVideoInputChange={changeVideoInput}
            onRetryMedia={() => void ensureLocalPreview({ forceRestart: true }).catch(() => undefined)}
            readyBusy={markReady.isPending}
            onReady={markLocalReady}
            onLeave={leave}
            leaveDisabled={abortDebate.isPending}
          />
        ) : (
          <>
            <section className="rounded-lg border border-grey-02 bg-white p-5 shadow-light">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <Text as="h3" variant="bodySemibold" color="text">
                    {statusLabel(debate.status)}
                  </Text>
                  <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[760px]">
                    {speakerStatus(debate)}
                  </Text>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {debate.participants.map(participant => (
                      <span
                        key={participant.user_id}
                        className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
                      >
                        <span className="truncate">
                          {participant.display_name || participant.profile_space_id} · {participant.position_label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {roomError &&
                    roomState === 'idle' &&
                    !['complete', 'cancelled'].includes(debate.status) &&
                    (!connectionConflict || canTakeOverConnection) && (
                      <Button
                        type="button"
                        onClick={connectionConflict ? takeOverConnection : retryConnection}
                        disabled={liveKitJoin.isPending || markJoined.isPending}
                      >
                        {connectionConflict ? 'Continue here' : 'Retry connection'}
                      </Button>
                    )}
                  <Button type="button" variant="secondary" onClick={() => router.push(`/space/${spaceId}/debates`)}>
                    Back to debates
                  </Button>
                </div>
              </div>

              {roomError && roomState === 'idle' && (
                <div className="mt-4 rounded-lg border border-red-01 bg-white px-5 py-4">
                  <Text color="red-01">{roomError}</Text>
                </div>
              )}
            </section>

            {roomState !== 'idle' && (
              <DebateRecordingModal
                debate={debate}
                roomState={roomState}
                roomError={roomError}
                countdown={countdown}
                localSlot={joinResponse?.participant_slot ?? null}
                localVideoRef={localVideoRef}
                remoteMediaRef={remoteMediaRef}
                remoteVideoReady={remoteVideoReady}
                audioMuted={audioMuted}
                remoteAudioEnabled={remoteAudioEnabled}
                videoEnabled={videoEnabled}
                onToggleAudioMuted={toggleAudioMuted}
                onToggleRemoteAudioEnabled={toggleRemoteAudioEnabled}
                onToggleVideoEnabled={toggleVideoEnabled}
                noiseFilterStatus={noiseFilterStatus}
                noiseFilterTogglePending={noiseFilterTogglePending}
                onToggleNoiseFilter={toggleNoiseFilter}
                rematchSession={rematchQuery.data ?? null}
                currentUserId={currentUserId}
                onRequestRematch={requestRematch}
                rematchConsentRequested={rematchConsentRequested}
                rematchBusy={consentToRematch.isPending}
                endTurnPending={pendingTurnYield !== null}
                onEndTurn={endLocalTurn}
                onRetryFinalization={retryLiveDebateFinalization}
                canRetryConnection={canRetryConnection}
                onRetryConnection={retryConnection}
                onLeave={leave}
                leaveDisabled={abortDebate.isPending || roomState === 'saving'}
              />
            )}
          </>
        ))}
      {recordingRemovalNotice}
    </div>
  );
}

function DebateRecordingModal({
  debate,
  roomState,
  roomError,
  countdown,
  localSlot,
  localVideoRef,
  remoteMediaRef,
  remoteVideoReady,
  audioMuted,
  remoteAudioEnabled,
  videoEnabled,
  onToggleAudioMuted,
  onToggleRemoteAudioEnabled,
  onToggleVideoEnabled,
  noiseFilterStatus,
  noiseFilterTogglePending,
  onToggleNoiseFilter,
  rematchSession,
  currentUserId,
  onRequestRematch,
  rematchConsentRequested,
  rematchBusy,
  endTurnPending,
  onEndTurn,
  onRetryFinalization,
  canRetryConnection,
  onRetryConnection,
  onLeave,
  leaveDisabled,
}: {
  debate: Debate;
  roomState: 'connecting' | 'reconnecting' | 'connected' | 'saving';
  roomError: string | null;
  countdown: DebateCountdown;
  localSlot: ParticipantSlot | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteMediaRef: React.RefObject<HTMLDivElement | null>;
  remoteVideoReady: boolean;
  audioMuted: boolean;
  remoteAudioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleRemoteAudioEnabled: () => void;
  onToggleVideoEnabled: () => void;
  noiseFilterStatus: DebateNoiseFilterStatus;
  noiseFilterTogglePending: boolean;
  onToggleNoiseFilter: () => void;
  rematchSession: DebateRematchSession | null;
  currentUserId: string | null;
  onRequestRematch: () => void;
  rematchConsentRequested: boolean;
  rematchBusy: boolean;
  endTurnPending: boolean;
  onEndTurn: () => void;
  onRetryFinalization: () => void;
  canRetryConnection: boolean;
  onRetryConnection: () => void;
  onLeave: () => void;
  leaveDisabled: boolean;
}) {
  const debateDebuggingEnabled = useFeatureFlag('debateDebugging');
  const localParticipant =
    (localSlot
      ? debate.participants.find(participant => participant.participant_slot === localSlot)
      : debate.participants.find(participant => participant.user_id === currentUserId)) ?? null;
  const remoteParticipant =
    debate.participants.find(participant => participant.user_id !== localParticipant?.user_id) ?? null;
  const localUpcomingSeconds = localTurnStartsInSeconds(debate, countdown, localSlot);
  const localUpcomingLabel =
    countdown.yieldingSlot && !countdown.preservesExistingCountIn
      ? 'Your turn in'
      : upcomingTurnIsRebuttal(debate, countdown)
        ? 'Rebut in'
        : "You're up in";
  const showLocalGo = localTurnGoIsVisible(countdown, localSlot);
  const showLocalWrapItUp = wrapItUpIsVisible(countdown, localSlot);
  const showLocalDebateEndsSoon = debateEndsSoonIsVisible(debate, countdown, localSlot);
  const thankingSlot = thankingParticipantSlot(debate, countdown);
  const localInactive = participantIsInactive(countdown.effectiveStatus, localSlot, countdown.activeSlot);
  const remoteInactive = participantIsInactive(
    countdown.effectiveStatus,
    remoteParticipant?.participant_slot ?? null,
    countdown.activeSlot
  );
  const localEndingTurn = countdown.yieldingSlot !== null && countdown.yieldingSlot === localSlot;
  const countdownRing =
    countdown.remainingSeconds > 0 ? (
      <RecordingCountdownRing
        remainingSeconds={countdown.remainingSeconds}
        progress={countdown.progress}
        variant={
          countdown.effectiveStatus === 'in_progress' &&
          countdown.activeSlot !== null &&
          countdown.remainingSeconds <= 5
            ? 'warning'
            : 'default'
        }
      />
    ) : null;
  const yieldedCountdownRing =
    countdown.yieldedRemainingSeconds !== null && countdown.yieldedProgress !== null ? (
      <RecordingCountdownRing
        remainingSeconds={countdown.yieldedRemainingSeconds}
        progress={countdown.yieldedProgress}
        variant="muted"
      />
    ) : null;
  const sharedPhaseCountdown = countdown.activeSlot === null && countdown.yieldingSlot === null ? countdownRing : null;
  const localCountdown = localEndingTurn
    ? null
    : countdown.activeSlot === localSlot
      ? countdownRing
      : sharedPhaseCountdown;
  const remoteCountdown =
    countdown.yieldingSlot === remoteParticipant?.participant_slot
      ? yieldedCountdownRing
      : countdown.activeSlot === remoteParticipant?.participant_slot
        ? countdownRing
        : sharedPhaseCountdown;
  const localRematchParticipant = rematchSession?.participants.find(
    participant => participant.user_id === currentUserId
  );
  const remoteRematchParticipant = rematchSession?.participants.find(
    participant => participant.user_id !== currentUserId
  );
  const localConsented = Boolean(localRematchParticipant?.consented_at);
  const remoteConsented = Boolean(remoteRematchParticipant?.consented_at);
  const connecting = countdown.effectiveStatus === 'connecting';
  const remoteEndingTurn =
    countdown.yieldingSlot !== null && countdown.yieldingSlot === remoteParticipant?.participant_slot;
  const canEndLocalTurn =
    countdown.effectiveStatus === 'in_progress' &&
    countdown.activeSlot === localSlot &&
    countdown.turnIndex !== null &&
    countdown.yieldingSlot === null;
  const localVideoTile = (
    <DebateVideoTile
      key="local"
      participantPosition={localParticipant?.position ?? null}
      positionLabel={localParticipant?.position_label ?? null}
      active={
        countdown.effectiveStatus === 'in_progress' &&
        (countdown.activeSlot === localSlot || countdown.yieldingSlot === localSlot)
      }
      overlayText={
        connecting
          ? roomState === 'connected' || Boolean(localParticipant?.joined_at)
            ? 'Connected'
            : 'Connecting'
          : videoEnabled
            ? null
            : 'Camera off'
      }
      upcomingSeconds={localUpcomingSeconds}
      upcomingLabel={localUpcomingLabel}
      endingTurn={localEndingTurn}
      endTurnAction={
        canEndLocalTurn || (endTurnPending && localEndingTurn) ? (
          <button
            type="button"
            onClick={onEndTurn}
            disabled={endTurnPending || localEndingTurn}
            className="min-h-9 rounded-full bg-black px-5 text-sm font-medium text-white shadow-light transition hover:bg-black/85 disabled:cursor-default disabled:opacity-70 md:min-h-14 md:px-8 md:text-xl"
          >
            End turn
          </button>
        ) : null
      }
      showGo={showLocalGo}
      showWrapItUp={showLocalWrapItUp}
      showDebateEndsSoon={showLocalDebateEndsSoon}
      inactive={localInactive}
      revealInactive={localUpcomingSeconds !== null || showLocalDebateEndsSoon || localEndingTurn}
      inactiveIndicatorId="local"
      showMutedIndicator={localEndingTurn}
      countdown={localCountdown}
      closingMessage={
        countdown.effectiveStatus === 'thanking' &&
        thankingSlot !== null &&
        localSlot !== null &&
        thankingSlot === localSlot
      }
    >
      <video ref={localVideoRef} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
    </DebateVideoTile>
  );
  const remoteVideoTile = (
    <DebateVideoTile
      key="remote"
      participantPosition={remoteParticipant?.position ?? null}
      positionLabel={remoteParticipant?.position_label ?? null}
      active={
        countdown.effectiveStatus === 'in_progress' &&
        (countdown.activeSlot === remoteParticipant?.participant_slot ||
          countdown.yieldingSlot === remoteParticipant?.participant_slot)
      }
      overlayText={
        connecting
          ? remoteParticipant?.joined_at
            ? 'Connected'
            : 'Connecting'
          : remoteVideoReady
            ? null
            : 'Waiting for video'
      }
      inactive={remoteInactive}
      endingTurn={remoteEndingTurn}
      revealInactive={remoteEndingTurn}
      inactiveIndicatorId="remote"
      countdown={remoteCountdown}
    >
      <div
        ref={remoteMediaRef}
        className="h-full w-full bg-grey-01 [&>audio]:hidden [&>video]:h-full [&>video]:w-full [&>video]:bg-grey-01 [&>video]:object-cover"
      />
    </DebateVideoTile>
  );
  const orderedVideoTiles =
    localParticipant?.position === false ? [remoteVideoTile, localVideoTile] : [localVideoTile, remoteVideoTile];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Debate recording"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text"
    >
      {debateDebuggingEnabled && (
        <DebateDebugMenu
          debate={debate}
          countdown={countdown}
          roomState={roomState}
          audioMuted={audioMuted}
          remoteAudioEnabled={remoteAudioEnabled}
          videoEnabled={videoEnabled}
          onToggleAudioMuted={onToggleAudioMuted}
          onToggleRemoteAudioEnabled={onToggleRemoteAudioEnabled}
          onToggleVideoEnabled={onToggleVideoEnabled}
          noiseFilterStatus={noiseFilterStatus}
          noiseFilterTogglePending={noiseFilterTogglePending}
          onToggleNoiseFilter={onToggleNoiseFilter}
        />
      )}

      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-2 py-8 sm:px-5">
        <h1 className="mb-5 max-w-[390px] text-center text-[1.375rem] leading-[1.1] font-semibold text-text">
          {debate.claim.claim}
        </h1>

        <div className="relative grid w-full gap-2">
          {orderedVideoTiles}

          {countdown.effectiveStatus === 'thanking' && countdown.remainingSeconds > 0 && (
            <DebateAgainCard
              opponentName={
                remoteRematchParticipant?.display_name ||
                remoteRematchParticipant?.profile_space_id ||
                remoteParticipant?.display_name ||
                remoteParticipant?.profile_space_id ||
                'Other debater'
              }
              localConsented={localConsented || rematchConsentRequested}
              remoteConsented={remoteConsented}
              busy={rematchBusy}
              onConsent={onRequestRematch}
            />
          )}
        </div>

        {roomState === 'reconnecting' && (
          <div className="mt-3 w-full rounded-lg border border-grey-02 bg-white px-4 py-3">
            <Text>Reconnecting to the debate room…</Text>
          </div>
        )}

        {roomError && (
          <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-red-01 bg-white px-4 py-3">
            <Text color="red-01">{roomError}</Text>
            {['thanking', 'complete'].includes(debate.status) && (
              <Button type="button" variant="tertiary" onClick={onRetryFinalization} disabled={roomState === 'saving'}>
                Retry save
              </Button>
            )}
            {canRetryConnection && (
              <Button type="button" variant="tertiary" onClick={onRetryConnection} disabled={roomState === 'saving'}>
                Retry connection
              </Button>
            )}
          </div>
        )}

        <div className="mt-5 flex w-full justify-end">
          <RecordingCircleButton
            ariaLabel={roomState === 'saving' ? 'Saving local recording' : 'Leave debate'}
            title={roomState === 'saving' ? 'Saving local recording' : 'Leave debate'}
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            <LeaveIcon />
          </RecordingCircleButton>
        </div>
      </main>
    </div>
  );
}

function DebateDebugMenu({
  debate,
  countdown,
  roomState,
  audioMuted,
  remoteAudioEnabled,
  videoEnabled,
  onToggleAudioMuted,
  onToggleRemoteAudioEnabled,
  onToggleVideoEnabled,
  noiseFilterStatus,
  noiseFilterTogglePending,
  onToggleNoiseFilter,
}: {
  debate: Debate;
  countdown: DebateCountdown;
  roomState: 'connecting' | 'reconnecting' | 'connected' | 'saving';
  audioMuted: boolean;
  remoteAudioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleRemoteAudioEnabled: () => void;
  onToggleVideoEnabled: () => void;
  noiseFilterStatus: DebateNoiseFilterStatus;
  noiseFilterTogglePending: boolean;
  onToggleNoiseFilter: () => void;
}) {
  const phases = debateDebugPhases(debate, countdown);
  const noiseFilterAvailable = noiseFilterStatus === 'enabled' || noiseFilterStatus === 'disabled';
  const noiseFilterDisabled = roomState === 'saving' || noiseFilterTogglePending || !noiseFilterAvailable;

  return (
    <aside className="fixed top-4 right-4 z-[1010] w-[min(280px,calc(100vw-2rem))] rounded-lg border border-grey-02 bg-white/95 p-3 shadow-card backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Text as="h2" variant="metadata" color="grey-04">
          Debate debugging
        </Text>
        <div className="flex items-center gap-2">
          <RecordingCircleButton
            ariaLabel={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            onClick={onToggleAudioMuted}
            disabled={roomState === 'saving'}
            active={audioMuted}
          >
            <MicrophoneIcon muted={audioMuted} />
          </RecordingCircleButton>
          <RecordingCircleButton
            ariaLabel={remoteAudioEnabled ? 'Disable audio' : 'Enable audio'}
            title={remoteAudioEnabled ? 'Disable audio' : 'Enable audio'}
            onClick={onToggleRemoteAudioEnabled}
            disabled={roomState === 'saving'}
            active={!remoteAudioEnabled}
          >
            <SpeakerIcon disabled={!remoteAudioEnabled} />
          </RecordingCircleButton>
          <RecordingCircleButton
            ariaLabel={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleVideoEnabled}
            disabled={roomState === 'saving'}
            active={!videoEnabled}
          >
            <CameraIcon disabled={!videoEnabled} />
          </RecordingCircleButton>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-label="Krisp noise filter"
        aria-checked={noiseFilterStatus === 'enabled'}
        disabled={noiseFilterDisabled}
        onClick={onToggleNoiseFilter}
        className="mt-3 flex min-h-10 w-full items-center justify-between gap-3 border-t border-grey-02 pt-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Text as="span" variant="metadata" color="text">
          Krisp noise filter
        </Text>
        <span className="flex shrink-0 items-center gap-2">
          <Text as="span" variant="metadata" color="grey-04">
            {noiseFilterTogglePending ? 'Saving…' : debateNoiseFilterStatusLabel[noiseFilterStatus]}
          </Text>
          <span
            aria-hidden="true"
            className={cx(
              'relative inline-flex h-5 w-9 rounded-full transition-colors',
              noiseFilterStatus === 'enabled' ? 'bg-ctaPrimary' : 'bg-grey-02'
            )}
          >
            <span
              className={cx(
                'shadow-sm absolute top-0.5 size-4 rounded-full bg-white transition-transform',
                noiseFilterStatus === 'enabled' ? 'translate-x-[18px]' : 'translate-x-0.5'
              )}
            />
          </span>
        </span>
      </button>

      <ol aria-label="Debate phases" className="mt-3 grid gap-1 border-t border-grey-02 pt-3">
        {phases.map(phase => (
          <li
            key={phase.id}
            aria-current={phase.current ? 'step' : undefined}
            className={cx(
              'flex min-h-8 items-center justify-between gap-3 rounded px-2.5 py-1.5 text-metadataMedium',
              phase.current ? 'bg-ctaPrimary text-white' : 'text-grey-04'
            )}
          >
            <span className="truncate">{phase.label}</span>
            {phase.duration && <span className="shrink-0 opacity-80">{phase.duration}</span>}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function debateDebugPhases(debate: Debate, countdown: DebateCountdown) {
  return [
    {
      id: 'connecting',
      label: 'Connecting',
      duration: null,
      current: countdown.effectiveStatus === 'connecting',
    },
    {
      id: 'preflight',
      label: 'Preflight',
      duration: null,
      current: countdown.effectiveStatus === 'preflight',
    },
    ...debate.turn_durations_ms.map((durationMs, index) => ({
      id: `turn-${index}`,
      label: `Timed turn ${index + 1}`,
      duration: formatDebugDuration(durationMs),
      current: countdown.effectiveStatus === 'in_progress' && countdown.turnIndex === index,
    })),
    {
      id: 'thanking',
      label: 'Thanking',
      duration: null,
      current: countdown.effectiveStatus === 'thanking',
    },
  ];
}

function formatDebugDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds > 0 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function DebateVideoTile({
  participantPosition,
  positionLabel,
  active,
  overlayText,
  upcomingSeconds,
  upcomingLabel = "You're up in",
  showGo = false,
  showWrapItUp = false,
  showDebateEndsSoon = false,
  endingTurn = false,
  endTurnAction,
  inactive = false,
  revealInactive = false,
  inactiveIndicatorId,
  showMutedIndicator = false,
  countdown,
  closingMessage = false,
  children,
}: {
  participantPosition: boolean | null;
  positionLabel: string | null;
  active: boolean;
  overlayText?: string | null;
  upcomingSeconds?: number | null;
  upcomingLabel?: string;
  showGo?: boolean;
  showWrapItUp?: boolean;
  showDebateEndsSoon?: boolean;
  endingTurn?: boolean;
  endTurnAction?: React.ReactNode;
  inactive?: boolean;
  revealInactive?: boolean;
  inactiveIndicatorId: 'local' | 'remote';
  showMutedIndicator?: boolean;
  countdown?: React.ReactNode;
  closingMessage?: boolean;
  children: React.ReactNode;
}) {
  const showInactiveIndicator =
    showMutedIndicator || (inactive && !revealInactive && !countdown && !overlayText && !endingTurn);

  return (
    <section
      data-debate-video-position={participantPosition === null ? undefined : participantPosition ? 'yes' : 'no'}
      data-active-speaker={active ? 'true' : 'false'}
      className={cx(
        'relative aspect-[5/3] min-h-0 overflow-hidden rounded-lg bg-black shadow-card',
        active && 'outline-[3px] outline-offset-0 outline-purple'
      )}
    >
      <div className="absolute inset-0 z-0">{children}</div>
      {endTurnAction && <div className="absolute top-3 left-3 z-40">{endTurnAction}</div>}
      <div
        aria-hidden="true"
        data-inactive-speaker={inactiveIndicatorId}
        data-visible={showInactiveIndicator ? 'true' : 'false'}
        className={cx(
          'pointer-events-none absolute top-3 right-3 z-20',
          showInactiveIndicator ? 'opacity-100' : 'opacity-0'
        )}
      >
        {showInactiveIndicator && <MutedMicrophoneIndicator />}
      </div>
      {countdown && <div className="pointer-events-none absolute top-3 right-3 z-20">{countdown}</div>}

      {positionLabel && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex h-4 items-center rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none text-text">
          {positionLabel}
        </div>
      )}

      {closingMessage && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Nice debate!
          <br />
          Say thanks
        </div>
      )}

      {endingTurn && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Ending turn…
        </div>
      )}

      {upcomingSeconds !== null && upcomingSeconds !== undefined && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center text-center">
          <div className="text-recordingLabel text-text" style={recordingLabelTextShadow}>
            {upcomingLabel}
          </div>
          <div className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white" style={recordingOverlayTextShadow}>
            {upcomingSeconds}
          </div>
        </div>
      )}

      {showGo && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center text-center text-[7.5rem] leading-none font-bold text-white"
          style={recordingOverlayTextShadow}
        >
          GO!
        </div>
      )}

      {showWrapItUp && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Wrap it up!
        </div>
      )}

      {showDebateEndsSoon && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Debate ends soon
        </div>
      )}

      {overlayText && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Text
            color="white"
            variant="bodySemibold"
            className="rounded-full border border-white/40 bg-black/70 px-4 py-2 shadow-light"
          >
            {overlayText}
          </Text>
        </div>
      )}
    </section>
  );
}

function participantIsInactive(
  effectiveStatus: Debate['status'],
  participantSlot: ParticipantSlot | null,
  activeSlot: ParticipantSlot | null
) {
  if (!participantSlot || effectiveStatus === 'thanking' || effectiveStatus === 'complete') return false;
  if (effectiveStatus === 'in_progress') return activeSlot !== participantSlot;
  return effectiveStatus === 'connecting' || effectiveStatus === 'preflight';
}

function localTurnGoIsVisible(countdown: DebateCountdown, localSlot: ParticipantSlot | null) {
  return (
    countdown.effectiveStatus === 'in_progress' &&
    localSlot !== null &&
    countdown.activeSlot === localSlot &&
    countdown.elapsedMs < 2_000
  );
}

function wrapItUpIsVisible(countdown: DebateCountdown, slot: ParticipantSlot | null) {
  return (
    countdown.effectiveStatus === 'in_progress' &&
    slot !== null &&
    countdown.activeSlot === slot &&
    countdown.remainingSeconds > 0 &&
    countdown.remainingSeconds <= 5
  );
}

function upcomingTurnIsRebuttal(debate: Debate, countdown: DebateCountdown) {
  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return false;
  const nextTurnIndex = countdown.turnIndex + 1;
  const turnCount = debate.turn_durations_ms.length;
  if (nextTurnIndex >= turnCount) return false;
  // Mirror format-details.tsx: round 0 is always an opening argument, so a turn is a
  // rebuttal only when it falls in the last round and that round is not the opening one.
  const roundIndex = Math.floor(nextTurnIndex / 2);
  return roundIndex !== 0 && roundIndex === Math.floor((turnCount - 1) / 2);
}

function debateEndsSoonIsVisible(debate: Debate, countdown: DebateCountdown, localSlot: ParticipantSlot | null) {
  if (!localSlot || countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return false;
  if (countdown.activeSlot === localSlot) return false;
  if (countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return false;
  return countdown.turnIndex === debate.turn_durations_ms.length - 1;
}

function thankingParticipantSlot(debate: Debate, countdown: DebateCountdown): ParticipantSlot | null {
  if (countdown.effectiveStatus !== 'thanking') return null;
  if (countdown.progress < 0.5) return debate.first_participant_slot;
  return debate.first_participant_slot === 1 ? 2 : 1;
}

function DebateRecordingRemovedDialog({
  cancellerName,
  claim,
  onAcknowledge,
}: {
  cancellerName: string;
  claim: string;
  onAcknowledge: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your debate was removed"
        className="w-full max-w-[370px] rounded-lg bg-white p-5 text-center text-text"
      >
        <Text as="h2" variant="cardEntityTitle" color="text" className="leading-none">
          Your debate was removed
        </Text>
        <Text as="p" variant="metadata" color="text" className="mt-2">
          {cancellerName} cancelled the upload of your debate
        </Text>
        <div className="mt-5 rounded-lg bg-grey-01 p-2">
          <Text as="p" variant="metadata" color="grey-04" className="line-clamp-2">
            {claim}
          </Text>
        </div>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onAcknowledge}
            className="min-h-7 rounded-full bg-text px-3 text-metadata text-white transition-colors hover:bg-text/90"
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}

function DebateAgainCard({
  opponentName,
  localConsented,
  remoteConsented,
  busy,
  onConsent,
}: {
  opponentName: string;
  localConsented: boolean;
  remoteConsented: boolean;
  busy: boolean;
  onConsent: () => void;
}) {
  return (
    <section className="absolute top-1/2 left-1/2 z-40 flex w-[calc(100%-7rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-hidden rounded-lg bg-white px-3 py-2 text-text shadow-card">
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <Text as="span" variant="smallTitle" color="text">
          Debate again?
        </Text>
        <button
          type="button"
          onClick={onConsent}
          disabled={busy || localConsented}
          className={cx(
            'min-h-7 rounded-full px-3 text-metadata text-white transition-colors disabled:cursor-default',
            localConsented ? 'bg-text' : 'bg-text hover:bg-text/90'
          )}
        >
          {localConsented ? 'Waiting...' : busy ? 'Saving...' : 'Yes'}
        </button>
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <Text as="span" variant="smallTitle" color="text" className="min-w-0 truncate">
          {opponentName}
        </Text>
        <span
          className={cx(
            'inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-metadata',
            remoteConsented ? 'bg-green text-text' : 'bg-grey-01 text-grey-04'
          )}
        >
          {remoteConsented && <Check />}
          {remoteConsented ? 'Ready' : 'Waiting...'}
        </span>
      </div>
    </section>
  );
}

function setLocalTrackPreferences(
  tracks: LocalTrackLike[],
  preferences: LocalTrackPreferences,
  sourceMediaStreamTracks?: WeakMap<LocalTrackLike, MediaStreamTrack>
) {
  for (const track of tracks) {
    if (track.mediaStreamTrack.kind === 'audio') {
      const sourceMediaStreamTrack = sourceMediaStreamTracks?.get(track);
      if (sourceMediaStreamTrack && sourceMediaStreamTrack !== track.mediaStreamTrack) {
        sourceMediaStreamTrack.enabled = preferences.audioEnabled;
      }
      track.mediaStreamTrack.enabled = preferences.audioEnabled;
    }
    if (track.mediaStreamTrack.kind === 'video') {
      track.mediaStreamTrack.enabled = preferences.videoEnabled;
    }
  }
}

function setRemoteMediaAudioEnabled(
  remoteMediaRef: React.RefObject<HTMLDivElement | null>,
  remoteAudioEnabled: boolean
) {
  for (const element of remoteMediaRef.current?.querySelectorAll('audio, video') ?? []) {
    if (element instanceof HTMLMediaElement) {
      element.muted = !remoteAudioEnabled;
    }
  }
}

function shouldEnableLocalAudio(
  effectiveStatus: Debate['status'] | null,
  activeSlot: ParticipantSlot | null,
  localSlot: ParticipantSlot | null,
  audioMuted: boolean
) {
  if (audioMuted || !effectiveStatus || !localSlot) return false;
  if (effectiveStatus === 'thanking') return true;
  return effectiveStatus === 'in_progress' && activeSlot === localSlot;
}

function localTurnStartsInSeconds(
  debate: Debate,
  countdown: DebateCountdown,
  localSlot: ParticipantSlot | null
): number | null {
  if (!localSlot || countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return null;

  if (countdown.effectiveStatus === 'preflight') {
    return countdown.activeSlot === localSlot ? countdown.remainingSeconds : null;
  }

  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return null;
  if (countdown.yieldingSlot !== null) {
    return countdown.incomingSlot === localSlot ? countdown.remainingSeconds : null;
  }
  if (countdown.activeSlot === localSlot) return null;

  const nextTurnIndex = countdown.turnIndex + 1;
  if (nextTurnIndex >= debate.turn_durations_ms.length) return null;

  return participantSlotForTurn(debate.first_participant_slot, nextTurnIndex) === localSlot
    ? countdown.remainingSeconds
    : null;
}

function participantSlotForTurn(firstParticipantSlot: ParticipantSlot, turnIndex: number): ParticipantSlot {
  if (turnIndex % 2 === 0) return firstParticipantSlot;
  return firstParticipantSlot === 1 ? 2 : 1;
}

function debateRoomOptions(audioOutputSupported: boolean, selectedAudioOutputId: string): RoomOptions {
  return {
    adaptiveStream: false,
    dynacast: false,
    // The SDK's default policy gives up after ~45 seconds of retries, which drops debaters whose
    // network blip (wifi handoff, brief cellular gap) would have recovered. Community calls
    // already retry for 3 minutes; debates deserve at least the same patience.
    reconnectPolicy: new ExtendedReconnectPolicy(),
    // The SDK default also disconnects on pagehide/beforeunload, which mobile browsers fire when
    // the phone locks or the tab is backgrounded. We tear the room down explicitly on unmount and
    // leave instead. Note this option does NOT gate the SDK's `freeze` listener — a frozen
    // Chromium tab still disconnects with CLIENT_INITIATED, which the Disconnected handler treats
    // as a genuine drop.
    disconnectOnPageLeave: false,
    publishDefaults: {
      simulcast: true,
      // Cap the primary layer at h540's budget. Capture stays at the 720p default so the local
      // recording keeps its resolution; only the published encode is capped, roughly halving the
      // ~2.3 Mbps uplink the SDK defaults ask of a 1:1 call rendered in a small tile.
      videoEncoding: { maxBitrate: 800_000, maxFramerate: 25 },
      // A talking head reads far better as soft video than as a slideshow: under congestion shed
      // resolution before framerate. The SDK otherwise computes 'balanced' for sub-1080p cameras.
      degradationPreference: 'maintain-framerate',
      videoCodec: 'vp8',
      // Redundant audio and DTX are already the mono defaults; pin them — they are the audio
      // armor slow connections rely on, and must not regress silently on an SDK upgrade.
      red: true,
      dtx: true,
    },
    ...(audioOutputSupported ? { audioOutput: { deviceId: selectedAudioOutputId } } : {}),
  };
}

function stopLocalTracks(localTracksRef: React.MutableRefObject<LocalTrackLike[]>) {
  stopTracks(localTracksRef.current);
  localTracksRef.current = [];
}

function stopTracks(tracks: LocalTrackLike[]) {
  for (const track of tracks) {
    track.detach?.();
    track.stop();
  }
}

function logDebateConnectionDiagnostic(
  event: 'ownership-blocked' | 'ownership-released' | 'livekit-disconnected',
  details: {
    debateId: string;
    instanceId: string;
    roomState: string;
    disconnectReason?: unknown;
  }
) {
  console.info('[DebateRoomConnection]', { event, ...details });
}

function captureDebateRoomConnectionEvent(
  eventName: 'debate_room_connection_conflict' | 'debate_room_ownership_recovered',
  details: {
    debateId: string;
    coordinationMode: DebateRoomOwnershipCoordinationMode;
    debateStatus: Debate['status'] | null;
    roomState: string;
    source?: DebateRoomConnectionConflictSource;
    waitedForLocalRelease?: boolean;
  }
) {
  try {
    capture(eventName, {
      debate_id: details.debateId,
      coordination_mode: details.coordinationMode,
      debate_status: details.debateStatus ?? 'unknown',
      room_state: details.roomState,
      visibility_state: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      has_focus: typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus(),
      navigation_type: currentNavigationType(),
      ...(details.source ? { source: details.source } : {}),
      ...(details.waitedForLocalRelease ? { waited_for_local_release: true } : {}),
    });
  } catch {
    // Analytics is best-effort and must never affect room ownership or connection recovery.
  }
}

function captureDebateRoomResilienceEvent(
  eventName: 'debate_room_reconnecting' | 'debate_room_reconnected' | 'debate_room_disconnected',
  details: {
    debateId: string;
    debateStatus: Debate['status'] | null;
    roomState: string;
    elapsedMs?: number;
    disconnectReason?: string;
  }
) {
  try {
    capture(eventName, {
      debate_id: details.debateId,
      debate_status: details.debateStatus ?? 'unknown',
      room_state: details.roomState,
      online: typeof navigator === 'undefined' ? null : navigator.onLine,
      visibility_state: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      has_focus: typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus(),
      ...(details.elapsedMs !== undefined ? { elapsed_ms: Math.max(0, Math.round(details.elapsedMs)) } : {}),
      ...(details.disconnectReason ? { disconnect_reason: details.disconnectReason } : {}),
    });
  } catch {
    // Analytics is best-effort and must never affect reconnection or room teardown.
  }
}

// LiveKit's DisconnectReason is a numeric protobuf enum; resolve the payload back to its name so
// analytics reads "SERVER_SHUTDOWN" instead of "3". Numeric-enum objects carry reverse mappings
// (numeric keys), which are skipped. Unknown values fall back to their stringified form.
function disconnectReasonName(disconnectReasons: Record<string, unknown>, payload: unknown) {
  if (payload === undefined || payload === null) return 'unknown';
  for (const [name, value] of Object.entries(disconnectReasons)) {
    if (value === payload && Number.isNaN(Number(name))) return name;
  }
  return String(payload);
}

function captureDebateRoomConnectionFailure({
  debateId,
  stage,
  elapsedMs,
  error,
}: {
  debateId: string;
  stage: DebateRoomConnectionStage;
  elapsedMs: number;
  error: unknown;
}) {
  try {
    capture('debate_room_connection_failed', {
      debate_id: debateId,
      stage,
      elapsed_ms: Math.max(0, Math.round(elapsedMs)),
      error_name: error instanceof Error ? error.name : 'UnknownError',
      error_message: error instanceof Error ? error.message : String(error),
      online: typeof navigator === 'undefined' ? null : navigator.onLine,
      visibility_state: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      has_focus: typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus(),
      navigation_type: currentNavigationType(),
    });
  } catch {
    // Diagnostics are best-effort and must never interfere with room cleanup or retry.
  }
}

function currentNavigationType() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return 'unknown';
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type ?? 'unknown';
}

// Mobile browsers behind cellular/symmetric NAT can take several seconds to establish the publisher
// PeerConnection, and the first publishTrack often rejects with "engine not connected within
// timeout" before ICE settles. Retry a couple times so a slow-but-viable connection isn't surfaced
// as a hard failure that drops the debater from the call.
async function publishTrackWithRetry(room: RoomLike, track: LocalTrackLike, isCurrent: () => boolean) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!isCurrent()) return;
    try {
      await room.localParticipant.publishTrack(track);
      return;
    } catch (error) {
      // A superseded attempt bails silently: throwing here would hit connect()'s catch, which runs
      // shared-ref cleanup that could tear down a newer active room.
      if (!isCurrent()) return;
      if (attempt >= maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
}

function disconnectRoom(
  roomRef: React.MutableRefObject<RoomLike | null>,
  localTracksRef: React.MutableRefObject<LocalTrackLike[]>,
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  remoteMediaRef: React.RefObject<HTMLDivElement | null>
) {
  stopLocalTracks(localTracksRef);
  roomRef.current?.disconnect();
  roomRef.current = null;
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = null;
  }
  if (remoteMediaRef.current) {
    remoteMediaRef.current.replaceChildren();
  }
}

function disconnectConnectingRoom(connectingRoomRef: React.MutableRefObject<RoomLike | null>) {
  connectingRoomRef.current?.disconnect();
  connectingRoomRef.current = null;
}

function useDebateCountdown(debate: Debate | null, serverNow: () => number): DebateCountdown {
  const [now, setNow] = React.useState(serverNow);
  const countdownWindow = debate ? countdownWindowForDebate(debate, now) : null;
  const completedThankYouDeadlineMs =
    debate?.status === 'complete' && isDebateInThankYouPeriod(debate, now)
      ? timestampMs(debate.turn_ends_at ?? debate.completed_at)
      : null;
  const boundaryAtMs = countdownWindow?.targetMs ?? completedThankYouDeadlineMs;

  React.useEffect(() => {
    const currentNow = serverNow();
    setNow(currentNow);
    const timer = window.setInterval(() => setNow(serverNow()), 500);
    const boundaryTimer =
      boundaryAtMs !== null && boundaryAtMs > currentNow
        ? window.setTimeout(() => setNow(serverNow()), boundaryAtMs - currentNow + 1)
        : null;
    return () => {
      window.clearInterval(timer);
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
    };
  }, [boundaryAtMs, serverNow]);

  if (!countdownWindow || countdownWindow.targetMs === null) {
    return {
      label: '00:00',
      remainingSeconds: 0,
      progress: 0,
      activeSlot: countdownWindow?.activeSlot ?? null,
      effectiveStatus: countdownWindow?.effectiveStatus ?? debate?.status ?? 'ready',
      turnIndex: countdownWindow?.turnIndex ?? null,
      elapsedMs: 0,
      yieldingSlot: countdownWindow?.yieldingSlot ?? null,
      incomingSlot: countdownWindow?.incomingSlot ?? null,
      yieldedRemainingSeconds: countdownWindow?.yieldedRemainingSeconds ?? null,
      yieldedProgress: countdownWindow?.yieldedProgress ?? null,
      preservesExistingCountIn: countdownWindow?.preservesExistingCountIn ?? false,
    };
  }

  const targetMs = countdownWindow.targetMs;
  const startMs = countdownWindow.startMs;
  const remainingMs = Math.max(0, targetMs - now);
  const seconds = Math.ceil(remainingMs / 1_000);
  const totalMs = startMs !== null ? Math.max(1, targetMs - startMs) : 0;
  const elapsedMs = startMs !== null ? Math.min(totalMs, Math.max(0, now - startMs)) : 0;

  return {
    label: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    remainingSeconds: seconds,
    progress: totalMs === 0 ? 0 : elapsedMs / totalMs,
    activeSlot: countdownWindow.activeSlot,
    effectiveStatus: countdownWindow.effectiveStatus,
    turnIndex: countdownWindow.turnIndex,
    elapsedMs,
    yieldingSlot: countdownWindow.yieldingSlot,
    incomingSlot: countdownWindow.incomingSlot,
    yieldedRemainingSeconds: countdownWindow.yieldedRemainingSeconds,
    yieldedProgress: countdownWindow.yieldedProgress,
    preservesExistingCountIn: countdownWindow.preservesExistingCountIn,
  };
}

function recordingWindowForDebate(debate: Debate): DebateRecordingWindow | null {
  const startAtMs = timestampMs(debate.started_at ?? debate.preflight_ends_at);
  if (startAtMs === null || debate.turn_durations_ms.length === 0) return null;

  let endAtMs = startAtMs;
  for (const [turnIndex, durationMs] of debate.turn_durations_ms.entries()) {
    const naturalTurnEndMs = endAtMs + Math.max(0, durationMs);
    const handoffDeadlineMs = timestampMs(
      debate.turn_yields?.find(turnYield => turnYield.turn_index === turnIndex)?.handoff_deadline_at ?? null
    );
    endAtMs = handoffDeadlineMs === null ? naturalTurnEndMs : Math.min(naturalTurnEndMs, handoffDeadlineMs);
  }

  if (endAtMs <= startAtMs) return null;

  return {
    startAtMs,
    endAtMs,
  };
}

function debateWithPendingYield(debate: Debate, pendingTurnYield: PendingTurnYield | null): Debate {
  if (!pendingTurnYield || debate.status !== 'in_progress') return debate;
  if (debate.turn_yields?.some(turnYield => turnYield.turn_index === pendingTurnYield.turnIndex)) return debate;

  const naturalDeadlineMs = timestampMs(debate.turn_ends_at) ?? pendingTurnYield.endedAtMs + 5_000;
  const endedAt = new Date(pendingTurnYield.endedAtMs).toISOString();

  return {
    ...debate,
    turn_yields: [
      ...(debate.turn_yields ?? []),
      {
        turn_index: pendingTurnYield.turnIndex,
        user_id: '__pending__',
        participant_slot: pendingTurnYield.participantSlot,
        yielded_at: endedAt,
        accepted_at: endedAt,
        // The real five-second handoff starts at server acceptance, which is unknowable while
        // this request is pending. Preserve the current deadline so a slow request cannot make
        // the optimistic UI advance before the authoritative response arrives.
        handoff_deadline_at: new Date(naturalDeadlineMs).toISOString(),
      },
    ],
  };
}

function countdownWindowForDebate(
  debate: Debate,
  now: number
): {
  startMs: number | null;
  targetMs: number | null;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
  yieldingSlot: ParticipantSlot | null;
  incomingSlot: ParticipantSlot | null;
  yieldedRemainingSeconds: number | null;
  yieldedProgress: number | null;
  preservesExistingCountIn: boolean;
} {
  if (debate.status === 'connecting') {
    return {
      startMs: null,
      targetMs: null,
      activeSlot: null,
      effectiveStatus: 'connecting',
      turnIndex: null,
      yieldingSlot: null,
      incomingSlot: null,
      yieldedRemainingSeconds: null,
      yieldedProgress: null,
      preservesExistingCountIn: false,
    };
  }

  if (debate.status === 'preflight') {
    const debateStartMs = timestampMs(debate.preflight_ends_at);
    if (debateStartMs !== null && now >= debateStartMs) {
      return timedDebateCountdownWindow(debate, debateStartMs, now);
    }
    return {
      startMs: debateStartMs === null ? null : debateStartMs - debatePreflightDurationMs,
      targetMs: debateStartMs,
      activeSlot: debate.first_participant_slot,
      effectiveStatus: 'preflight',
      turnIndex: null,
      yieldingSlot: null,
      incomingSlot: null,
      yieldedRemainingSeconds: null,
      yieldedProgress: null,
      preservesExistingCountIn: false,
    };
  }

  if (debate.status === 'in_progress') {
    const debateStartMs = timestampMs(debate.started_at ?? debate.preflight_ends_at);
    if (debateStartMs !== null) {
      return timedDebateCountdownWindow(debate, debateStartMs, now);
    }
    return {
      startMs: timestampMs(debate.turn_started_at),
      targetMs: timestampMs(debate.turn_ends_at),
      activeSlot: debate.current_speaker_slot,
      effectiveStatus: 'in_progress',
      turnIndex: debate.current_turn_index,
      yieldingSlot: null,
      incomingSlot: null,
      yieldedRemainingSeconds: null,
      yieldedProgress: null,
      preservesExistingCountIn: false,
    };
  }

  if (debate.status === 'thanking') {
    return {
      startMs: timestampMs(debate.turn_started_at),
      targetMs: timestampMs(debate.turn_ends_at),
      activeSlot: null,
      effectiveStatus: 'thanking',
      turnIndex: null,
      yieldingSlot: null,
      incomingSlot: null,
      yieldedRemainingSeconds: null,
      yieldedProgress: null,
      preservesExistingCountIn: false,
    };
  }

  return {
    startMs: null,
    targetMs: null,
    activeSlot: null,
    effectiveStatus: debate.status,
    turnIndex: null,
    yieldingSlot: null,
    incomingSlot: null,
    yieldedRemainingSeconds: null,
    yieldedProgress: null,
    preservesExistingCountIn: false,
  };
}

export function isDebateInThankYouPeriod(
  debate: Pick<Debate, 'status' | 'turn_ends_at' | 'completed_at'>,
  now: number
) {
  if (debate.status !== 'thanking' && debate.status !== 'complete') return false;
  const deadline = timestampMs(debate.turn_ends_at ?? debate.completed_at);
  return deadline !== null && now < deadline;
}

function timedDebateCountdownWindow(
  debate: Debate,
  debateStartMs: number,
  now: number
): {
  startMs: number;
  targetMs: number;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
  yieldingSlot: ParticipantSlot | null;
  incomingSlot: ParticipantSlot | null;
  yieldedRemainingSeconds: number | null;
  yieldedProgress: number | null;
  preservesExistingCountIn: boolean;
} {
  let turnStartMs = debateStartMs;

  for (const [turnIndex, configuredDurationMs] of debate.turn_durations_ms.entries()) {
    const naturalTurnEndMs = turnStartMs + Math.max(0, configuredDurationMs);
    const turnYield = debate.turn_yields?.find(candidate => candidate.turn_index === turnIndex);
    const yieldedAtMs = turnYield ? timestampMs(turnYield.yielded_at) : null;
    const handoffDeadlineMs = turnYield ? timestampMs(turnYield.handoff_deadline_at) : null;
    const validYieldedAtMs =
      yieldedAtMs !== null && yieldedAtMs >= turnStartMs && yieldedAtMs <= naturalTurnEndMs ? yieldedAtMs : null;
    const validHandoffDeadlineMs =
      validYieldedAtMs !== null && handoffDeadlineMs !== null
        ? Math.max(validYieldedAtMs, Math.min(naturalTurnEndMs, handoffDeadlineMs))
        : null;

    if (
      validYieldedAtMs !== null &&
      validHandoffDeadlineMs !== null &&
      (now >= validYieldedAtMs || turnYield?.user_id === '__pending__')
    ) {
      if (now < validHandoffDeadlineMs) {
        const yieldingSlot = participantSlotForTurn(debate.first_participant_slot, turnIndex);
        return {
          startMs: validYieldedAtMs,
          targetMs: validHandoffDeadlineMs,
          activeSlot: null,
          effectiveStatus: 'in_progress',
          turnIndex,
          yieldingSlot,
          incomingSlot:
            turnIndex + 1 < debate.turn_durations_ms.length
              ? participantSlotForTurn(debate.first_participant_slot, turnIndex + 1)
              : null,
          yieldedRemainingSeconds: Math.max(0, Math.ceil((naturalTurnEndMs - validYieldedAtMs) / 1_000)),
          yieldedProgress:
            configuredDurationMs > 0
              ? Math.max(0, Math.min(1, (validYieldedAtMs - turnStartMs) / configuredDurationMs))
              : 0,
          preservesExistingCountIn: validHandoffDeadlineMs === naturalTurnEndMs,
        };
      }
      turnStartMs = validHandoffDeadlineMs;
      continue;
    }

    if (now < naturalTurnEndMs) {
      return {
        startMs: turnStartMs,
        targetMs: naturalTurnEndMs,
        activeSlot: participantSlotForTurn(debate.first_participant_slot, turnIndex),
        effectiveStatus: 'in_progress',
        turnIndex,
        yieldingSlot: null,
        incomingSlot: null,
        yieldedRemainingSeconds: null,
        yieldedProgress: null,
        preservesExistingCountIn: false,
      };
    }
    turnStartMs = validHandoffDeadlineMs ?? naturalTurnEndMs;
  }

  return {
    startMs: turnStartMs,
    targetMs: turnStartMs + debateThankingDurationMs,
    activeSlot: null,
    effectiveStatus: 'thanking',
    turnIndex: null,
    yieldingSlot: null,
    incomingSlot: null,
    yieldedRemainingSeconds: null,
    yieldedProgress: null,
    preservesExistingCountIn: false,
  };
}

function speakerStatus(debate: Debate) {
  if (debate.status === 'connecting') return 'Connecting both speakers.';
  if (debate.status === 'preflight') return 'Get ready. The first turn is about to start.';
  if (debate.status === 'in_progress' && debate.current_speaker_slot) {
    return `${labelForSlot(debate, debate.current_speaker_slot)} is speaking.`;
  }
  if (debate.status === 'thanking') return 'Wrap-up is running. Both speakers can thank each other.';
  if (debate.status === 'complete') return 'Debate complete.';
  if (debate.status === 'cancelled') return 'Debate cancelled.';
  return 'Waiting for both speakers to join.';
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function rematchDestination(session: DebateRematchSession | null | undefined) {
  if (!session) return null;
  if (session.status === 'converted' && session.converted_debate_id) {
    return `/space/${session.source_space_id}/debates/${session.converted_debate_id}`;
  }
  if (['browsing', 'request_pending'].includes(session.status)) {
    return `/space/${session.source_space_id}/debates/rematches/${session.id}`;
  }
  return null;
}

function labelForSlot(debate: Debate, slot: ParticipantSlot) {
  return debate.participants.find(participant => participant.participant_slot === slot)?.position_label ?? 'Position';
}

function speakerName(participant: Pick<Debate['participants'][number], 'display_name' | 'profile_space_id'>) {
  return participant.display_name || participant.profile_space_id;
}

function timestampMs(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}
