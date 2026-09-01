'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import { SmallButton } from '~/design-system/button';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import {
  GeoChatRequestError,
  type GetPrivyIdentityToken,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type LocalRecordingUploadResponse,
  cancelDebateRecording,
  completeLocalRecordingUpload,
  createLocalRecordingUpload,
  resolveCurrentGeoChatUserId,
  retryDebatePhaseBoundaryRequest,
} from './api';
import { debateQueryKeys, useDebateActivity, useGeoChatAuth } from './hooks';
import {
  type DebateRecordingUpload,
  deleteDebateRecordingUpload,
  getDebateRecordingUpload,
  markDebateRecordingUploaded,
  observeDebateRecordingUploads,
  scheduleDebateRecordingRetry,
} from './recording-upload-queue';
import {
  usePublishOptOutRequest,
  useSetPublishOptOutOffer,
  useSetPublishOptOutRequest,
  useThankingDebate,
} from './thanking-debate-store';

const initialRetryDelayMs = 5_000;
const maxRetryDelayMs = 5 * 60_000;

// Upload failures the backend will never resolve on retry. Retrying these keeps the
// "Uploading N debate" banner up forever, so instead we drop the local blob. Transient
// failures (network errors, 5xx, expired auth) are deliberately absent — those must keep
// retrying.
const permanentRecordingUploadErrorCodes = new Set([
  'recording_cancelled', // the opponent cancelled the debate recording
  'recording_not_ready', // the debate was aborted/cancelled and can no longer be finalized
  'invalid_recording', // duration, timestamp, or framerate the backend rejects
  'invalid_recording_mime_type', // an unsupported container the backend rejects
  'recording_upload_missing', // the presigned object never landed in storage
  'recording_upload_size_mismatch', // the stored object no longer matches the completion request
  'recording_upload_type_mismatch',
]);

export function isPermanentRecordingUploadError(error: unknown): boolean {
  return (
    error instanceof GeoChatRequestError &&
    error.status === 400 &&
    error.code !== null &&
    permanentRecordingUploadErrorCodes.has(error.code)
  );
}

type DebateRecordingUploadWaitingReason = 'offline' | 'retry' | 'waiting' | null;

type RecordingUploadDependencies = {
  createUpload: (debateId: string, request: LocalRecordingUploadRequest) => Promise<LocalRecordingUploadResponse>;
  putRecording: (upload: LocalRecordingUploadResponse['upload'], blob: Blob, mimeType: string) => Promise<void>;
  markUploaded: (id: string, filename: string) => Promise<void>;
  completeUpload: (debateId: string, request: LocalRecordingCompleteRequest) => Promise<unknown>;
  deleteUpload: (id: string) => Promise<void>;
};

export async function processDebateRecordingUpload(
  upload: DebateRecordingUpload,
  dependencies: RecordingUploadDependencies
) {
  const startedAtMs = Math.round(upload.startedAtMs);
  const endedAtMs = Math.round(upload.endedAtMs);
  let filename = upload.filename;
  if (upload.stage === 'queued' || !filename) {
    const target = await dependencies.createUpload(upload.debateId, {
      mime_type: upload.mimeType,
      started_at_ms: startedAtMs,
    });
    await dependencies.putRecording(target.upload, upload.blob, upload.mimeType);
    filename = target.filename;
    await dependencies.markUploaded(upload.id, filename);
  }

  await retryDebatePhaseBoundaryRequest(() =>
    dependencies.completeUpload(upload.debateId, {
      filename,
      mime_type: upload.mimeType,
      started_at_ms: startedAtMs,
      ended_at_ms: endedAtMs,
      duration_seconds: upload.durationSeconds,
      byte_size: upload.byteSize,
      width: upload.width,
      height: upload.height,
      framerate: upload.framerate,
      video_bits_per_second: upload.videoBitsPerSecond,
    })
  );
  await dependencies.deleteUpload(upload.id);
}

export function recordingUploadRetryDelay(attemptCount: number) {
  return Math.min(maxRetryDelayMs, initialRetryDelayMs * 2 ** Math.max(0, attemptCount));
}

export function DebateRecordingUploadCoordinator() {
  const queryClient = useQueryClient();
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const [userId, setUserId] = React.useState<string | null>(null);
  const [uploads, setUploads] = React.useState<DebateRecordingUpload[]>([]);
  const [activeUploadId, setActiveUploadId] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [wakeAt, setWakeAt] = React.useState(() => Date.now());
  const [identityRetrySignal, setIdentityRetrySignal] = React.useState(0);
  const [cancelTargetDebateId, setCancelTargetDebateId] = React.useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<{ id: string; loaded: number } | null>(null);
  // Debates whose recording finished uploading in this session and is still publishable. The queue
  // row is deleted as soon as an upload completes, so nothing else can keep the banner and its
  // cancellation action on screen for the rest of the thank-you period.
  const [uploadedDebateIds, setUploadedDebateIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [cancelledDebateIds, setCancelledDebateIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const thankingDebate = useThankingDebate();
  const thankingDebateId = thankingDebate?.debateId ?? null;
  const normalizedThankingDebateId = thankingDebateId ? normalizeDebateId(thankingDebateId) : null;
  const isUploadCancelled = React.useCallback(
    (upload: DebateRecordingUpload) => {
      const debateId = normalizeDebateId(upload.debateId);
      return (
        cancelledDebateIds.has(debateId) ||
        (thankingDebate?.recordingCancelled === true && debateId === normalizedThankingDebateId)
      );
    },
    [cancelledDebateIds, normalizedThankingDebateId, thankingDebate?.recordingCancelled]
  );
  const publishableUploads = React.useMemo(
    () => uploads.filter(upload => !isUploadCancelled(upload)),
    [isUploadCancelled, uploads]
  );
  // What the banner speaks for, which is not always the whole queue.
  //
  // While the thank-you card is up it reports its own debate, so the banner would be a second
  // voice on the same upload — the bar at the bottom of the screen is exactly what GEO-2773
  // replaces. Only for as long as the card is actually on screen: the server's thank-you window
  // outlasts the countdown, and after it the banner is the only thing left to say anything.
  // Uploads from other debates stay the banner's to report, and keep their own progress.
  //
  // Everything the banner renders comes off this — the count, the percentage, and the waiting and
  // failure states below. Deriving those from the full queue instead would let the banner report
  // one debate's count under another debate's error.
  const cardOwnsPublishControl = Boolean(thankingDebate?.showsPublishControl);
  const bannerUploads = React.useMemo(
    () =>
      cardOwnsPublishControl
        ? publishableUploads.filter(upload => normalizeDebateId(upload.debateId) !== normalizedThankingDebateId)
        : publishableUploads,
    [cardOwnsPublishControl, normalizedThankingDebateId, publishableUploads]
  );

  const activeUploadIdRef = React.useRef<string | null>(null);
  const lockRetryAtRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const identityAttemptsRef = React.useRef(0);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !authenticated) {
      // Signing back in starts a new identity resolution, so it shouldn't inherit the
      // backoff the previous session had built up.
      identityAttemptsRef.current = 0;
      setUserId(null);
      setUploads([]);
      setUploadedDebateIds(new Set());
      setCancelledDebateIds(new Set());
      return;
    }
    setUserId(null);
    setUploads([]);
    let cancelled = false;
    let retryTimer: number | null = null;
    void resolveCurrentGeoChatUserId(getPrivyIdentityToken, accountKey)
      .then(id => {
        if (!id) throw new Error('The debate upload user could not be resolved.');
        if (!cancelled) {
          identityAttemptsRef.current = 0;
          setUserId(id);
        }
      })
      .catch(error => {
        console.warn('[DebateRecordingUploadCoordinator] could not resolve user:', error);
        if (!cancelled) {
          // A flat retry interval keeps Privy's token endpoint rate-limited, so it never recovers.
          const delay = recordingUploadRetryDelay(identityAttemptsRef.current);
          identityAttemptsRef.current += 1;
          retryTimer = window.setTimeout(() => setIdentityRetrySignal(current => current + 1), delay);
        }
      });
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [accountKey, authenticated, getPrivyIdentityToken, identityRetrySignal, ready]);

  React.useEffect(() => {
    if (!userId) {
      setUploads([]);
      return;
    }
    const subscription = observeDebateRecordingUploads(userId).subscribe({
      next: setUploads,
      error: error => console.warn('[DebateRecordingUploadCoordinator] queue observation failed:', error),
    });
    return () => subscription.unsubscribe();
  }, [userId]);

  // Recording persistence and cancellation can finish in either order at the phase
  // boundary. If a cancelled debate appears in IndexedDB afterward, keep it hidden, never start
  // its upload, and remove the late row as soon as the observer reports it.
  React.useEffect(() => {
    for (const upload of uploads) {
      if (!isUploadCancelled(upload)) continue;
      void deleteDebateRecordingUpload(upload.id).catch(error =>
        console.warn('[DebateRecordingUploadCoordinator] could not remove cancelled upload:', error)
      );
    }
  }, [isUploadCancelled, uploads]);

  React.useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setWakeAt(Date.now());
      if (!userId) setIdentityRetrySignal(current => current + 1);
    };
    const handleOffline = () => setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setWakeAt(Date.now());
        if (!userId) setIdentityRetrySignal(current => current + 1);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId]);

  React.useEffect(() => {
    if (activeUploadId || publishableUploads.length === 0) return;
    const nextAttemptAt = Math.min(...publishableUploads.map(upload => upload.nextAttemptAt));
    const delay = Math.max(0, nextAttemptAt - Date.now());
    if (delay === 0) return;
    const timer = window.setTimeout(() => setWakeAt(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [activeUploadId, publishableUploads]);

  React.useEffect(() => {
    if (!userId || !online || activeUploadIdRef.current || Date.now() < lockRetryAtRef.current) return;
    const upload = publishableUploads.find(candidate => candidate.nextAttemptAt <= Date.now());
    if (!upload) return;

    activeUploadIdRef.current = upload.id;
    setActiveUploadId(upload.id);
    const dependencies = recordingUploadDependencies(getPrivyIdentityToken, accountKey, loaded => {
      if (mountedRef.current) setUploadProgress({ id: upload.id, loaded });
    });
    let attemptStage = upload.stage;
    let attemptCount = upload.attemptCount;
    void withRecordingUploadLock(async () => {
      const latestUpload = await getDebateRecordingUpload(upload.id);
      if (!latestUpload || latestUpload.userId !== userId) return;
      attemptStage = latestUpload.stage;
      attemptCount = latestUpload.attemptCount;
      await processDebateRecordingUpload(latestUpload, {
        ...dependencies,
        markUploaded: async (id, filename) => {
          await dependencies.markUploaded(id, filename);
          attemptStage = 'uploaded';
          attemptCount = 0;
        },
      });
      if (mountedRef.current) {
        setUploadedDebateIds(current => new Set(current).add(normalizeDebateId(latestUpload.debateId)));
      }
      // Auto-publish to the knowledge graph is handled server-side by the debate-acceptor cron
      // sweep (app/api/debates/publish-sweep), so nothing to enqueue here.
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(upload.debateId) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(upload.debateId) });
    })
      .then(acquired => {
        if (!acquired) {
          lockRetryAtRef.current = Date.now() + 1_000;
          window.setTimeout(() => setWakeAt(Date.now()), 1_000);
        }
      })
      .catch(async error => {
        // Drop the local blob for failures no retry can fix (see the permanent codes above)
        // instead of leaving the banner up forever.
        if (isPermanentRecordingUploadError(error)) {
          try {
            await deleteDebateRecordingUpload(upload.id);
          } catch (queueError) {
            console.warn('[DebateRecordingUploadCoordinator] could not delete unpublishable upload:', queueError);
          }
          return;
        }
        const nextAttemptAt = Date.now() + recordingUploadRetryDelay(upload.attemptCount);
        console.warn('[DebateRecordingUploadCoordinator] upload attempt failed:', {
          uploadId: upload.id,
          debateId: upload.debateId,
          stage: attemptStage,
          attemptCount: attemptCount + 1,
          nextAttemptAt,
          error,
        });
        try {
          await scheduleDebateRecordingRetry(upload.id, error, nextAttemptAt);
        } catch (queueError) {
          console.warn('[DebateRecordingUploadCoordinator] could not persist retry state:', queueError);
        }
      })
      .finally(() => {
        activeUploadIdRef.current = null;
        if (mountedRef.current) {
          setActiveUploadId(null);
          setUploadProgress(null);
          setWakeAt(Date.now());
        }
      });
  }, [accountKey, activeUploadId, getPrivyIdentityToken, online, publishableUploads, queryClient, userId, wakeAt]);

  // Active *for the banner*, not for the queue. The upload in flight can be the thank-you debate's,
  // which the banner has stopped speaking for — counting that as activity had it claim to be
  // uploading while every recording it does report was sitting in backoff.
  const bannerUploadActive = activeUploadId !== null && bannerUploads.some(upload => upload.id === activeUploadId);
  const waiting = !online || (!bannerUploadActive && bannerUploads.every(upload => upload.nextAttemptAt > Date.now()));
  const latestFailedUpload = bannerUploads.reduce<DebateRecordingUpload | null>((latest, upload) => {
    if (!upload.lastError) return latest;
    return !latest || upload.updatedAt > latest.updatedAt ? upload : latest;
  }, null);
  let waitingReason: DebateRecordingUploadWaitingReason = null;
  if (!online) {
    waitingReason = 'offline';
  } else if (waiting) {
    waitingReason = latestFailedUpload ? 'retry' : 'waiting';
  }

  // Opting out of publishing is offered only during the thank-you period, and only for the debate
  // whose thank-you screen the user is on. Every other queued upload keeps going. The target is the
  // upload's own id, which is the form the queue and the cancel request use.
  const thankingUpload =
    normalizedThankingDebateId &&
    !thankingDebate?.recordingCancelled &&
    !cancelledDebateIds.has(normalizedThankingDebateId)
      ? (publishableUploads.find(upload => normalizeDebateId(upload.debateId) === normalizedThankingDebateId) ?? null)
      : null;
  // A fast connection can finish the upload before the user reaches the Cancel action. Keep the
  // uploaded debate banner open until thanking ends, since the backend still accepts a cancel.
  // Debates dropped as unpublishable never enter `uploadedDebateIds`, so they get no opt-out.
  const thankingUploadFinished =
    normalizedThankingDebateId !== null &&
    !thankingUpload &&
    !thankingDebate?.recordingCancelled &&
    !cancelledDebateIds.has(normalizedThankingDebateId) &&
    (uploadedDebateIds.has(normalizedThankingDebateId) || Boolean(thankingDebate?.hasUploadedRecording));
  const thankingRecordingPending =
    normalizedThankingDebateId !== null &&
    !thankingUpload &&
    !thankingUploadFinished &&
    Boolean(thankingDebate?.hasPendingLocalRecording) &&
    !thankingDebate?.recordingCancelled &&
    !cancelledDebateIds.has(normalizedThankingDebateId);
  const cancellableDebateId =
    thankingUpload?.debateId ?? (thankingUploadFinished || thankingRecordingPending ? thankingDebateId : null);
  const cancelPromptOpen = cancelTargetDebateId !== null;

  const bannerThankingUploadFinished = !cardOwnsPublishControl && thankingUploadFinished;
  const bannerThankingRecordingPending = !cardOwnsPublishControl && thankingRecordingPending;

  // The thank-you card draws the opt-out now, so tell it what there is to offer. Published in a
  // layout effect for the same reason the room publishes its side in one: the control and the
  // banner have to agree within a single paint at the countdown boundary, or one of them shows a
  // state the other has already left.
  // `cancelled` is what this knows and the room does not yet: the server has accepted the opt-out,
  // whether or not the room's debate query has caught up. Without it the card has no way to tell
  // "withdrawn" from "never recorded" until that refetch lands, and drops the row in between.
  const thankingOptedOut =
    normalizedThankingDebateId !== null &&
    (cancelledDebateIds.has(normalizedThankingDebateId) || thankingDebate?.recordingCancelled === true);
  const setPublishOptOutOffer = useSetPublishOptOutOffer();
  React.useLayoutEffect(() => {
    setPublishOptOutOffer({ debateId: cancellableDebateId, busy: cancelBusy, cancelled: thankingOptedOut });
  }, [cancelBusy, cancellableDebateId, setPublishOptOutOffer, thankingOptedOut]);
  React.useEffect(
    () => () => setPublishOptOutOffer({ debateId: null, busy: false, cancelled: false }),
    [setPublishOptOutOffer]
  );

  // And take up what the card asks for. It opens the same confirmation the Cancel button did —
  // the ticket calls for a new control, not a new behaviour, and a switch is easier to hit by
  // accident than the button it replaces (GEO-2700 makes that expensive).
  const publishOptOutRequest = usePublishOptOutRequest();
  const setPublishOptOutRequest = useSetPublishOptOutRequest();
  React.useEffect(() => {
    if (!publishOptOutRequest) return;
    // A request for some other debate is one whose moment has passed — the viewer has left that
    // thank-you screen — so it is dropped rather than acted on.
    if (normalizeDebateId(publishOptOutRequest) !== normalizedThankingDebateId) {
      setPublishOptOutRequest(null);
      return;
    }
    // Otherwise held until there is something to act on. The queue is read from IndexedDB, so
    // `cancellableDebateId` can still be null on the render the request arrives in; consuming it
    // there would swallow the flick and leave the switch off over a recording still uploading.
    if (cancellableDebateId === null) return;
    setPublishOptOutRequest(null);
    setCancelTargetDebateId(cancellableDebateId);
  }, [cancellableDebateId, normalizedThankingDebateId, publishOptOutRequest, setPublishOptOutRequest]);

  // Only poll debate activity while a banner might show, and hide it while the user is in a
  // live debate — the upload keeps running, it just shouldn't be on screen mid-debate.
  const { data: activity } = useDebateActivity(
    publishableUploads.length > 0 || thankingUploadFinished || thankingRecordingPending
  );
  const activityDebateId = activity?.debate ? normalizeDebateId(activity.debate.id) : null;
  const inLiveDebate = Boolean(
    activity?.debate &&
    ['connecting', 'preflight', 'in_progress'].includes(activity.debate.status) &&
    activityDebateId !== normalizedThankingDebateId
  );

  // When the banner is showing upload progress, its percentage covers every queued recording.
  const queuedBytes = bannerUploads.reduce((total, upload) => total + upload.byteSize, 0);
  const transferredBytes = bannerUploads.reduce((transferred, upload) => {
    if (upload.stage === 'uploaded') return transferred + upload.byteSize;
    if (uploadProgress?.id === upload.id) return transferred + Math.min(uploadProgress.loaded, upload.byteSize);
    return transferred;
  }, 0);
  // Once every byte is out the wait is finalization, not transfer. A pinned "100%" would look
  // stuck, so fall back to the plain in-progress copy.
  const uploadPercent =
    queuedBytes > 0 && transferredBytes < queuedBytes ? Math.round((transferredBytes / queuedBytes) * 100) : null;

  const closeCancelPrompt = React.useCallback(() => {
    if (cancelBusy) return;
    setCancelTargetDebateId(null);
    setCancelError(null);
  }, [cancelBusy]);

  const confirmCancel = React.useCallback(async () => {
    if (!cancelTargetDebateId) return;
    const normalizedTargetDebateId = normalizeDebateId(cancelTargetDebateId);
    setCancelBusy(true);
    setCancelError(null);
    try {
      try {
        await retryDebatePhaseBoundaryRequest(() =>
          cancelDebateRecording(cancelTargetDebateId, getPrivyIdentityToken, accountKey)
        );
      } catch (error) {
        // Already cancelled or gone on the backend — still drop the local blob below.
        const terminal =
          error instanceof GeoChatRequestError && (error.code === 'recording_cancelled' || error.status === 404);
        if (!terminal) throw error;
      }
      if (mountedRef.current) {
        // The server opt-out is authoritative even if this device cannot clean IndexedDB. Mark it
        // before local cleanup so a storage failure can never make Cancel available again.
        setCancelledDebateIds(current => new Set(current).add(normalizedTargetDebateId));
        setUploadedDebateIds(current => {
          const next = new Set(current);
          next.delete(normalizedTargetDebateId);
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(cancelTargetDebateId) });
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(cancelTargetDebateId) });
        // Cancelling ends the debate and the rematch it anchored. Until activity says so the
        // viewer still reads as mid-flow, which greys out every Debate control on every surface.
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
      }
      try {
        await Promise.all(
          uploads
            .filter(upload => isSameDebateId(upload.debateId, cancelTargetDebateId))
            .map(upload => deleteDebateRecordingUpload(upload.id))
        );
      } catch {
        throw new Error('Publication was cancelled, but this device could not remove its local recording. Try again.');
      }
      if (mountedRef.current) {
        setCancelTargetDebateId(null);
      }
    } catch (error) {
      if (mountedRef.current) setCancelError(error instanceof Error ? error.message : 'Could not cancel the upload.');
    } finally {
      if (mountedRef.current) setCancelBusy(false);
    }
  }, [accountKey, cancelTargetDebateId, getPrivyIdentityToken, queryClient, uploads]);

  // Close the prompt only when there is nothing left to cancel. The upload finishing mid-prompt
  // must not close it, since the backend still cancels an uploaded recording.
  React.useEffect(() => {
    if (!cancelTargetDebateId) return;
    const target = normalizeDebateId(cancelTargetDebateId);
    const stillQueued = uploads.some(upload => normalizeDebateId(upload.debateId) === target);
    const stillCancellableFromSnapshot =
      cancellableDebateId !== null && normalizeDebateId(cancellableDebateId) === target;
    if (!stillQueued && !uploadedDebateIds.has(target) && !stillCancellableFromSnapshot) {
      setCancelTargetDebateId(null);
    }
  }, [cancelTargetDebateId, cancellableDebateId, uploadedDebateIds, uploads]);

  const bannerVisible = bannerUploads.length > 0 || bannerThankingUploadFinished || bannerThankingRecordingPending;
  if ((!bannerVisible && !cancelPromptOpen) || inLiveDebate) {
    return null;
  }

  return (
    <>
      {bannerVisible && (
        <DebateRecordingUploadBanner
          count={bannerUploads.length}
          thankingRecordingPending={bannerThankingRecordingPending}
          thankingUploadFinished={bannerThankingUploadFinished}
          percent={uploadPercent}
          waitingReason={waitingReason}
          errorMessage={latestFailedUpload?.lastError ?? null}
          canCancel={!cardOwnsPublishControl && cancellableDebateId !== null && !cancelPromptOpen}
          onCancel={() => setCancelTargetDebateId(cancellableDebateId)}
        />
      )}
      {cancelPromptOpen && (
        <DebateCancelUploadDialog
          busy={cancelBusy}
          error={cancelError}
          onConfirm={confirmCancel}
          onClose={closeCancelPrompt}
        />
      )}
    </>
  );
}

export function DebateRecordingUploadBanner({
  count,
  thankingRecordingPending = false,
  thankingUploadFinished = false,
  percent = null,
  waitingReason,
  errorMessage,
  canCancel,
  onCancel,
}: {
  count: number;
  thankingRecordingPending?: boolean;
  thankingUploadFinished?: boolean;
  percent?: number | null;
  waitingReason: DebateRecordingUploadWaitingReason;
  errorMessage: string | null;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const label = `${count} debate${count === 1 ? '' : 's'}`;
  let message: string;
  if (thankingRecordingPending) {
    message = 'Preparing debate upload';
  } else if (thankingUploadFinished) {
    // The actionable thank-you debate takes priority while unrelated recordings keep uploading.
    message = 'Debate uploaded';
  } else if (waitingReason === 'offline') {
    message = `Waiting to upload ${label} — waiting for a connection`;
  } else if (waitingReason === 'retry' && errorMessage) {
    const failure = errorMessage.trim();
    const punctuation = /[.!?]$/.test(failure) ? '' : '.';
    message = `Waiting to upload ${label} — ${failure}${punctuation} Retrying automatically.`;
  } else if (waitingReason) {
    message = `Waiting to upload ${label}`;
  } else {
    message = `Uploading & publishing ${label}`;
  }

  const showProgress = thankingRecordingPending || (!thankingUploadFinished && waitingReason === null);
  const progressPercent = thankingRecordingPending ? null : percent;
  const progressLabel = thankingRecordingPending ? message : `Uploading and publishing ${label}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 flex h-7 min-w-0 items-center justify-center bg-divider px-4 text-metadata text-text ${Z_LAYER_CLASS.toast}`}
    >
      <div className="flex w-auto max-w-full min-w-0 items-center gap-2 md:w-full">
        <span className="min-w-0 flex-initial truncate md:flex-1">{message}</span>
        {showProgress && (
          <div
            role="progressbar"
            aria-label={progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent ?? undefined}
            className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-grey-03"
          >
            <div
              className={`h-full rounded-full bg-text transition-[width] ${progressPercent === null ? 'w-1/3 animate-pulse' : ''}`}
              style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
            />
          </div>
        )}
        {canCancel && (
          <SmallButton
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="shrink-0 bg-transparent! hover:bg-bg!"
          >
            Cancel
          </SmallButton>
        )}
      </div>
    </div>
  );
}

export function DebateCancelUploadDialog({
  busy,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`fixed inset-0 grid place-items-center bg-black/60 px-4 ${Z_LAYER_CLASS.toast}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Don’t want to publish?"
        className="w-full max-w-[370px] rounded-lg bg-white p-5 text-center text-text"
      >
        <div className="flex items-center justify-between gap-2.5">
          {/* Balances the close button so the title stays centered on the card. */}
          <span aria-hidden="true" className="size-4 shrink-0" />
          <Text as="h2" variant="cardEntityTitle" color="text" className="flex-1 text-center leading-none">
            Don’t want to publish?
          </Text>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-4 shrink-0 place-items-center rounded-full text-grey-04 hover:bg-grey-01"
          >
            <CloseSmall />
          </button>
        </div>
        <Text as="p" variant="metadata" color="text" className="mt-2">
          This action permanently removes this debate video on behalf of you and your opponent.
        </Text>
        {error && (
          <Text as="p" variant="metadata" color="red-01" className="mt-2">
            {error}
          </Text>
        )}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="mt-5 flex min-h-7 w-full items-center justify-center rounded-full bg-red-01 px-4 text-metadata text-white transition-colors hover:bg-red-01/90 disabled:opacity-50"
        >
          {busy ? 'Removing...' : 'Delete debate forever'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-5 min-h-7 w-full rounded-full px-4 text-metadata text-grey-04 hover:bg-grey-01 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function normalizeDebateId(id: string) {
  return id.replace(/-/g, '').toLowerCase();
}

function isSameDebateId(a: string, b: string) {
  return normalizeDebateId(a) === normalizeDebateId(b);
}

function recordingUploadDependencies(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  onProgress?: (loadedBytes: number) => void
): RecordingUploadDependencies {
  return {
    createUpload: (debateId, request) =>
      createLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
    putRecording: (upload, blob, mimeType) => putRecording(upload, blob, mimeType, onProgress),
    markUploaded: markDebateRecordingUploaded,
    completeUpload: (debateId, request) =>
      completeLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
    deleteUpload: deleteDebateRecordingUpload,
  };
}

// XHR rather than `fetch`: only XHR reports upload progress, which the banner's percent needs.
function putRecording(
  upload: LocalRecordingUploadResponse['upload'],
  blob: Blob,
  mimeType: string,
  onProgress?: (loadedBytes: number) => void
) {
  const headers = new Headers(upload.headers);
  headers.set('Content-Type', mimeType);

  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    headers.forEach((value, key) => request.setRequestHeader(key, value));
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Recording upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error('Recording upload failed.'));
    request.send(blob);
  });
}

async function withRecordingUploadLock(task: () => Promise<void>) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    let acquired = false;
    await navigator.locks.request('geo:debate-recording-uploader', { ifAvailable: true }, async lock => {
      if (!lock) return;
      acquired = true;
      await task();
    });
    return acquired;
  }
  await task();
  return true;
}
