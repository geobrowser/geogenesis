'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { useAppBottomInset } from '~/core/app-bottom-inset';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { SmallButton } from '~/design-system/button';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import {
  GeoChatRequestError,
  type GetPrivyIdentityToken,
  type LocalRecordingCompleteRequest,
  type LocalRecordingPartUrl,
  type LocalRecordingUploadRequest,
  type LocalRecordingUploadResponse,
  type ObjectStoreUpload,
  abortLocalRecordingMultipart,
  cancelDebateRecording,
  completeLocalRecordingUpload,
  createLocalRecordingUpload,
  getDebate,
  getLocalRecordingPartUrls,
  resolveCurrentGeoChatUserId,
  retryDebatePhaseBoundaryRequest,
} from './api';
import { debateQueryKeys, useDebateActivity, useGeoChatAuth } from './hooks';
import {
  RECORDING_STREAM_ORPHAN_AFTER_MS,
  type StreamedRecordingMultipart,
  isMissingRouteError,
  partRange,
  putRecordingPart,
  recoverOrphanedRecordingStreams,
  uploadRemainingParts,
} from './recording-stream';
import {
  type DebateRecordingUpload,
  debateRecordingUploadId,
  deleteDebateRecordingUpload,
  enqueueDebateRecordingUpload,
  getDebateRecordingUpload,
  markDebateRecordingUploaded,
  observeDebateRecordingUploads,
  requeueDebateRecordingParts,
  scheduleDebateRecordingRetry,
  setDebateRecordingMultipart,
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

/** Where a cancellation was asked for: the thank-you card's Publish switch, or the upload banner. */
type RecordingCancelSource = 'thanking_toggle' | 'upload_banner';

/** An upload error in analytics terms: geo-chat's code and status where it has them. */
function uploadErrorProperties(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    return { error_code: error.code, http_status: error.status, error_name: 'GeoChatRequestError' };
  }
  return {
    error_code: null,
    http_status: null,
    error_name: error instanceof Error ? error.name : typeof error,
  };
}

type DebateRecordingUploadWaitingReason = 'offline' | 'retry' | 'waiting' | null;

type RecordingUploadDependencies = {
  createUpload: (debateId: string, request: LocalRecordingUploadRequest) => Promise<LocalRecordingUploadResponse>;
  putRecording: (upload: LocalRecordingUploadResponse['upload'], blob: Blob, mimeType: string) => Promise<void>;
  markUploaded: (id: string, filename: string) => Promise<void>;
  completeUpload: (debateId: string, request: LocalRecordingCompleteRequest) => Promise<unknown>;
  deleteUpload: (id: string) => Promise<void>;
  /** GEO-2955: the parts of a recording that was streamed during the debate. */
  getPartUrls?: (
    debateId: string,
    filename: string,
    uploadId: string,
    partNumbers: number[]
  ) => Promise<LocalRecordingPartUrl[]>;
  putPart?: (upload: ObjectStoreUpload, body: Blob) => Promise<void>;
  setMultipart?: (id: string, multipart: StreamedRecordingMultipart | null) => Promise<void>;
  requeueParts?: (id: string) => Promise<void>;
  onPartsProgress?: (uploadedBytes: number) => void;
};

export async function processDebateRecordingUpload(
  upload: DebateRecordingUpload,
  dependencies: RecordingUploadDependencies
) {
  const startedAtMs = Math.round(upload.startedAtMs);
  const endedAtMs = Math.round(upload.endedAtMs);
  let filename = upload.filename;
  let multipart = streamedMultipart(upload, dependencies);
  if (upload.stage === 'queued' || !filename) {
    if (multipart) {
      try {
        await sendRemainingParts(upload, multipart, dependencies);
        filename = multipart.filename;
      } catch (error) {
        // A geo-chat that has lost the multipart routes since the debate started. The recording
        // is whole in the queue, so send it the old way rather than failing the upload.
        if (!isMissingRouteError(error)) throw error;
        multipart = null;
        await dependencies.setMultipart?.(upload.id, null);
        capture('debate_recording_upload_fallback', { debate_id: upload.debateId, reason: 'multipart_route_missing' });
      }
    }
    if (!multipart) {
      const target = await dependencies.createUpload(upload.debateId, {
        mime_type: upload.mimeType,
        started_at_ms: startedAtMs,
      });
      await dependencies.putRecording(target.upload, upload.blob, upload.mimeType);
      filename = target.filename;
    }
    await dependencies.markUploaded(upload.id, filename!);
  }

  try {
    await retryDebatePhaseBoundaryRequest(() =>
      dependencies.completeUpload(upload.debateId, {
        filename: filename!,
        mime_type: upload.mimeType,
        started_at_ms: startedAtMs,
        ended_at_ms: endedAtMs,
        duration_seconds: upload.durationSeconds,
        byte_size: upload.byteSize,
        width: upload.width,
        height: upload.height,
        framerate: upload.framerate,
        video_bits_per_second: upload.videoBitsPerSecond,
        ...(multipart ? { multipart_upload_id: multipart.uploadId } : {}),
      })
    );
  } catch (error) {
    // The server listed the parts and something this client believed sent is not there. Forget
    // what it believed, so the retry sends every part again instead of completing the same gap.
    if (multipart && error instanceof GeoChatRequestError && error.code === 'recording_upload_incomplete') {
      await dependencies.requeueParts?.(upload.id);
      capture('debate_recording_parts_requeued', { debate_id: upload.debateId });
    }
    throw error;
  }
  await dependencies.deleteUpload(upload.id);
}

/** The streamed upload to finish, when this row has one and the transport to finish it. */
function streamedMultipart(
  upload: DebateRecordingUpload,
  dependencies: RecordingUploadDependencies
): StreamedRecordingMultipart | null {
  if (!upload.multipart || !dependencies.getPartUrls || !dependencies.putPart) return null;
  return upload.multipart;
}

async function sendRemainingParts(
  upload: DebateRecordingUpload,
  multipart: StreamedRecordingMultipart,
  dependencies: RecordingUploadDependencies
) {
  const progress = { ...multipart, uploadedPartNumbers: [...multipart.uploadedPartNumbers] };
  await uploadRemainingParts(
    upload.blob,
    multipart,
    {
      getPartUrls: (partFilename, uploadId, partNumbers) =>
        dependencies.getPartUrls!(upload.debateId, partFilename, uploadId, partNumbers),
      putPart: dependencies.putPart!,
    },
    async (partNumber, uploadedBytes) => {
      progress.uploadedPartNumbers = [...progress.uploadedPartNumbers, partNumber];
      await dependencies.setMultipart?.(upload.id, progress);
      dependencies.onPartsProgress?.(uploadedBytes);
    }
  );
}

/** Bytes of a queued recording already in storage, from the parts streamed during the debate. */
export function streamedRecordingBytes(upload: DebateRecordingUpload): number {
  const multipart = upload.multipart;
  if (!multipart) return 0;
  return multipart.uploadedPartNumbers.reduce((total, partNumber) => {
    const range = partRange(partNumber, multipart.partSize, upload.byteSize);
    return total + Math.max(0, range.end - range.start);
  }, 0);
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
  // Which control opened the prompt, for analytics. A ref: it only rides along with the target.
  const cancelSourceRef = React.useRef<RecordingCancelSource>('upload_banner');
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
  // The thank-you card carries the publish opt-out while it is on screen, so the banner doesn't
  // draw a second control for the same debate (GEO-2773). It still speaks for that debate's
  // upload: the card answers "will this be published?", the banner answers "how much is still
  // going out, and can I close the tab yet?" — and that second question is about the whole queue,
  // the thank-you debate included. Deriving the count from anything narrower is what made the
  // banner disappear for the length of the thank-you period.
  const cardOwnsPublishControl = Boolean(thankingDebate?.showsPublishControl);

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

  // GEO-2955. A tab that died mid-debate left its recording in IndexedDB, chunk by chunk, with no
  // queue row pointing at it. Adopt it once its debate can accept it; see
  // `recoverOrphanedRecordingStreams` for what is recovered and what is discarded.
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const recover = () =>
      recoverOrphanedRecordingStreams(userId, {
        getDebate: debateId => getDebate(debateId, getPrivyIdentityToken, accountKey),
        hasQueuedUpload: async (streamUserId, debateId) => {
          const queued = await getDebateRecordingUpload(debateRecordingUploadId(streamUserId, debateId));
          return queued ? { multipartUploadId: queued.multipart?.uploadId ?? null } : null;
        },
        enqueue: async (stream, blob) => {
          await enqueueDebateRecordingUpload({
            userId: stream.userId,
            debateId: stream.debateId,
            blob,
            mimeType: stream.mimeType,
            startedAtMs: stream.startedAtMs,
            endedAtMs: stream.lastChunkAtMs,
            durationSeconds: Math.max(1, Math.round((stream.lastChunkAtMs - stream.startedAtMs) / 1_000)),
            width: stream.width,
            height: stream.height,
            framerate: stream.framerate,
            videoBitsPerSecond: stream.videoBitsPerSecond,
            multipart: stream.multipart,
          });
        },
        abortMultipart: (debateId, filename, uploadId) =>
          abortLocalRecordingMultipart(debateId, { filename, upload_id: uploadId }, getPrivyIdentityToken, accountKey),
      }).catch(error => console.warn('[DebateRecordingUploadCoordinator] recording recovery failed:', error));
    void recover();
    // A stream whose debate was still running is looked at again, as is one that only now went
    // quiet long enough to count as orphaned.
    const timer = window.setInterval(() => {
      if (!cancelled) void recover();
    }, RECORDING_STREAM_ORPHAN_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accountKey, getPrivyIdentityToken, userId]);

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
          // The recording is dropped here and never retried, so this is the one place a lost upload
          // can be counted. `recording_cancelled` is included: it is the opponent's cancellation
          // reaching this device, which the canceller's own event does not see.
          capture('debate_recording_upload_failed', {
            debate_id: upload.debateId,
            stage: attemptStage,
            attempt_count: attemptCount + 1,
            ...uploadErrorProperties(error),
          });
          try {
            await deleteDebateRecordingUpload(upload.id);
          } catch (queueError) {
            console.warn('[DebateRecordingUploadCoordinator] could not delete unpublishable upload:', queueError);
          }
          return;
        }
        const nextAttemptAt = Date.now() + recordingUploadRetryDelay(upload.attemptCount);
        // Bounded by the backoff (5s doubling to 5 minutes), so one stuck upload cannot flood this.
        capture('debate_recording_upload_retry_scheduled', {
          debate_id: upload.debateId,
          stage: attemptStage,
          attempt_count: attemptCount + 1,
          online: typeof navigator === 'undefined' || navigator.onLine,
          ...uploadErrorProperties(error),
        });
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

  // The upload in flight can be one already withdrawn — the cancellation lands while its request
  // is still running — so an id alone doesn't mean the banner has anything to report as moving.
  const uploadActive = activeUploadId !== null && publishableUploads.some(upload => upload.id === activeUploadId);
  // Uploads run one at a time, so an upload in flight that isn't a publishable one means every
  // recording left is queued behind it — waiting, whatever their backoff says. The backoff check
  // only decides the case where nothing is uploading at all: then a recording past its next
  // attempt is about to start, and one still backing off is not.
  const waiting =
    !online ||
    (!uploadActive &&
      (activeUploadId !== null || publishableUploads.every(upload => upload.nextAttemptAt > Date.now())));
  const latestFailedUpload = publishableUploads.reduce<DebateRecordingUpload | null>((latest, upload) => {
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

  // "Debate uploaded" is the banner's line about the Cancel action beside it — the upload is done
  // and still withdrawable — so it belongs to the banner only while the banner owns that action.
  // While the card does, the banner has nothing left to say about a finished upload and falls back
  // to reporting whatever else is still going out.
  const bannerThankingUploadFinished = !cardOwnsPublishControl && thankingUploadFinished;
  // Everything still on its way out of this browser, counted as debates rather than queue rows.
  // The thank-you recording is counted before it reaches IndexedDB — persisting the blob takes a
  // moment and the banner has to be up for the whole thank-you period, not from partway through.
  const pendingUploadCount = publishableUploads.length + (thankingRecordingPending ? 1 : 0);
  // The one pending recording has not reached the queue yet, so there is no queue state to
  // describe — neither "uploading" nor "waiting" is true of it.
  const preparingOnly = thankingRecordingPending && publishableUploads.length === 0;

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
    cancelSourceRef.current = 'thanking_toggle';
    setCancelTargetDebateId(cancellableDebateId);
  }, [cancellableDebateId, normalizedThankingDebateId, publishOptOutRequest, setPublishOptOutRequest]);

  // Only poll debate activity while a banner might show, and hide it while the user is in a
  // live debate — the upload keeps running, it just shouldn't be on screen mid-debate.
  const { data: activity } = useDebateActivity(pendingUploadCount > 0 || thankingUploadFinished);
  const activityDebateId = activity?.debate ? normalizeDebateId(activity.debate.id) : null;
  const inLiveDebate = Boolean(
    activity?.debate &&
    ['connecting', 'preflight', 'in_progress'].includes(activity.debate.status) &&
    activityDebateId !== normalizedThankingDebateId
  );

  // When the banner is showing upload progress, its percentage covers every queued recording.
  const queuedBytes = publishableUploads.reduce((total, upload) => total + upload.byteSize, 0);
  const transferredBytes = publishableUploads.reduce((transferred, upload) => {
    if (upload.stage === 'uploaded') return transferred + upload.byteSize;
    // A streamed recording arrives with most of its bytes already out, and a multipart attempt
    // reports whole parts; count whichever is further along.
    const streamed = streamedRecordingBytes(upload);
    const live = uploadProgress?.id === upload.id ? uploadProgress.loaded : 0;
    return transferred + Math.min(Math.max(streamed, live), upload.byteSize);
  }, 0);
  // Once every byte is out the wait is finalization, not transfer. A pinned "100%" would look
  // stuck, so fall back to the plain in-progress copy.
  //
  // A recording still being written to IndexedDB has no byte size yet, so while one is pending the
  // queue is not the whole of what the bar is counting and any figure off it is already wrong.
  // Indeterminate until its row lands, rather than a percentage that drops when it does.
  const uploadPercent =
    thankingRecordingPending || queuedBytes === 0 || transferredBytes >= queuedBytes
      ? null
      : Math.round((transferredBytes / queuedBytes) * 100);

  const closeCancelPrompt = React.useCallback(() => {
    if (cancelBusy) return;
    // Backing out is worth counting beside the cancellations: it is how often the prompt talked
    // someone out of it, or was opened by accident.
    if (cancelTargetDebateId) {
      capture('debate_recording_upload_cancel_dismissed', {
        debate_id: cancelTargetDebateId,
        cancel_source: cancelSourceRef.current,
      });
    }
    setCancelTargetDebateId(null);
    setCancelError(null);
  }, [cancelBusy, cancelTargetDebateId]);

  const confirmCancel = React.useCallback(async () => {
    if (!cancelTargetDebateId) return;
    const normalizedTargetDebateId = normalizeDebateId(cancelTargetDebateId);
    setCancelBusy(true);
    setCancelError(null);
    try {
      let alreadyCancelled = false;
      try {
        await retryDebatePhaseBoundaryRequest(() =>
          cancelDebateRecording(cancelTargetDebateId, getPrivyIdentityToken, accountKey)
        );
      } catch (error) {
        // Already cancelled or gone on the backend — still drop the local blob below.
        const terminal =
          error instanceof GeoChatRequestError && (error.code === 'recording_cancelled' || error.status === 404);
        if (!terminal) throw error;
        alreadyCancelled = true;
      }
      // Sent once the server has accepted the cancellation, before the best-effort local cleanup,
      // so a storage failure below cannot lose a cancellation that did happen.
      capture('debate_recording_upload_cancelled', {
        debate_id: cancelTargetDebateId,
        cancel_source: cancelSourceRef.current,
        // Whether every byte was already out: cancelling then withdraws a finished upload.
        upload_finished: uploadedDebateIds.has(normalizedTargetDebateId),
        already_cancelled: alreadyCancelled,
      });
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
      // The server has refused publication already; this only stops the parts streamed during
      // the debate from sitting in storage until R2's own 7-day cleanup. Best effort.
      for (const upload of uploads) {
        if (!isSameDebateId(upload.debateId, cancelTargetDebateId) || !upload.multipart) continue;
        void abortLocalRecordingMultipart(
          upload.debateId,
          { filename: upload.multipart.filename, upload_id: upload.multipart.uploadId },
          getPrivyIdentityToken,
          accountKey
        ).catch(() => undefined);
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
  }, [accountKey, cancelTargetDebateId, getPrivyIdentityToken, queryClient, uploadedDebateIds, uploads]);

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

  const bannerVisible = pendingUploadCount > 0 || bannerThankingUploadFinished;
  // The banner sits on the bottom edge of the viewport across its full width, so anything else
  // anchored down there — the assistant launcher and its panel, bottom-opening dropdowns — has to
  // clear it. `h-7` is 28px; the two have to be changed together.
  //
  // Claimed before the early return below, since hooks cannot run conditionally, and gated on the
  // same two conditions that decide whether the banner actually paints.
  useAppBottomInset('debate-upload-banner', 28, bannerVisible && !inLiveDebate);

  if ((!bannerVisible && !cancelPromptOpen) || inLiveDebate) {
    return null;
  }

  return (
    <>
      {bannerVisible && (
        <DebateRecordingUploadBanner
          count={pendingUploadCount}
          preparingOnly={preparingOnly}
          thankingUploadFinished={bannerThankingUploadFinished}
          percent={uploadPercent}
          waitingReason={waitingReason}
          errorMessage={latestFailedUpload?.lastError ?? null}
          canCancel={!cardOwnsPublishControl && cancellableDebateId !== null && !cancelPromptOpen}
          onCancel={() => {
            cancelSourceRef.current = 'upload_banner';
            setCancelTargetDebateId(cancellableDebateId);
          }}
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
  preparingOnly = false,
  thankingUploadFinished = false,
  percent = null,
  waitingReason,
  errorMessage,
  canCancel,
  onCancel,
}: {
  /** Debates still on their way out of this browser, the one being prepared locally included. */
  count: number;
  /** The only thing pending is a recording still being written to IndexedDB — no bytes in flight. */
  preparingOnly?: boolean;
  thankingUploadFinished?: boolean;
  percent?: number | null;
  waitingReason: DebateRecordingUploadWaitingReason;
  errorMessage: string | null;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const label = `${count} debate${count === 1 ? '' : 's'}`;
  let message: string;
  if (thankingUploadFinished && count === 0) {
    // Nothing left on the wire, and the thank-you debate can still be withdrawn — so the line
    // belongs to the Cancel action beside it. A queue that is still moving outranks it: that is
    // the one thing on screen telling the user this tab still has work to finish.
    message = 'Debate uploaded';
  } else if (preparingOnly) {
    message = 'Preparing debate upload';
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

  // A bar for work in progress, so it tracks the queue rather than the message: "Debate uploaded"
  // over a queue that is still moving gets one, and an empty queue never does whatever the message
  // says. Preparing is the exception — no bytes are in flight yet, but a recording is on its way
  // into the queue, which is exactly what an indeterminate bar is for.
  const showProgress = preparingOnly || (waitingReason === null && count > 0);
  const progressLabel = preparingOnly ? message : `Uploading and publishing ${label}`;
  // Uploads only make progress while this tab is open. Closing it doesn't lose the recording — the
  // queue is in IndexedDB and resumes on the next visit — but it does park it indefinitely, and
  // the debate stays unpublished until then. The warning follows the count and nothing else,
  // "Debate uploaded" included: that line speaks for the one debate beside the Cancel action,
  // while the queue behind it can still be busy.
  const showKeepBrowserOpen = count > 0;

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
            aria-valuenow={percent ?? undefined}
            className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-grey-03"
          >
            <div
              className={`h-full rounded-full bg-text transition-[width] ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
        )}
        {showKeepBrowserOpen && <span className="shrink-0 text-grey-04">Keep browser open</span>}
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
    getPartUrls: (debateId, filename, uploadId, partNumbers) =>
      getLocalRecordingPartUrls(
        debateId,
        { filename, upload_id: uploadId, part_numbers: partNumbers },
        getPrivyIdentityToken,
        accountKey
      ),
    putPart: putRecordingPart,
    setMultipart: setDebateRecordingMultipart,
    requeueParts: requeueDebateRecordingParts,
    onPartsProgress: onProgress,
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
