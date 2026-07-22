'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Check } from '~/design-system/icons/check';
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

  await dependencies.completeUpload(upload.debateId, {
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
  });
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
  const [cancelPromptOpen, setCancelPromptOpen] = React.useState(false);
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
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
    if (activeUploadId || uploads.length === 0) return;
    const nextAttemptAt = Math.min(...uploads.map(upload => upload.nextAttemptAt));
    const delay = Math.max(0, nextAttemptAt - Date.now());
    if (delay === 0) return;
    const timer = window.setTimeout(() => setWakeAt(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [activeUploadId, uploads]);

  React.useEffect(() => {
    if (!userId || !online || activeUploadIdRef.current || Date.now() < lockRetryAtRef.current) return;
    const upload = uploads.find(candidate => candidate.nextAttemptAt <= Date.now());
    if (!upload) return;

    activeUploadIdRef.current = upload.id;
    setActiveUploadId(upload.id);
    const dependencies = recordingUploadDependencies(getPrivyIdentityToken, accountKey);
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
          setWakeAt(Date.now());
        }
      });
  }, [accountKey, activeUploadId, getPrivyIdentityToken, online, queryClient, uploads, userId, wakeAt]);

  const waiting = !online || (!activeUploadId && uploads.every(upload => upload.nextAttemptAt > Date.now()));
  const latestFailedUpload = uploads.reduce<DebateRecordingUpload | null>((latest, upload) => {
    if (!upload.lastError) return latest;
    return !latest || upload.updatedAt > latest.updatedAt ? upload : latest;
  }, null);
  let waitingReason: DebateRecordingUploadWaitingReason = null;
  if (!online) {
    waitingReason = 'offline';
  } else if (waiting) {
    waitingReason = latestFailedUpload ? 'retry' : 'waiting';
  }

  // Only poll debate activity while a banner might show, and hide it while the user is in a
  // live debate — the upload keeps running, it just shouldn't be on screen mid-debate.
  const { data: activity } = useDebateActivity(uploads.length > 0);
  const inLiveDebate = Boolean(
    activity?.debate && ['connecting', 'preflight', 'in_progress'].includes(activity.debate.status)
  );

  const closeCancelPrompt = React.useCallback(() => {
    if (cancelBusy) return;
    setCancelPromptOpen(false);
    setCancelError(null);
  }, [cancelBusy]);

  const confirmCancel = React.useCallback(async () => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      const debateIds = [...new Set(uploads.map(upload => upload.debateId))];
      for (const debateId of debateIds) {
        try {
          await cancelDebateRecording(debateId, getPrivyIdentityToken, accountKey);
        } catch (error) {
          // Already cancelled or gone on the backend — still drop the local blob below.
          const terminal =
            error instanceof GeoChatRequestError && (error.code === 'recording_cancelled' || error.status === 404);
          if (!terminal) throw error;
        }
      }
      await Promise.all(uploads.map(upload => deleteDebateRecordingUpload(upload.id)));
      if (mountedRef.current) setCancelPromptOpen(false);
    } catch (error) {
      if (mountedRef.current) setCancelError(error instanceof Error ? error.message : 'Could not cancel the upload.');
    } finally {
      if (mountedRef.current) setCancelBusy(false);
    }
  }, [accountKey, getPrivyIdentityToken, uploads]);

  // If the upload finishes while the prompt is open, there is nothing left to delete, so the
  // user can no longer choose to cancel — close it automatically.
  React.useEffect(() => {
    if (uploads.length === 0 && cancelPromptOpen) setCancelPromptOpen(false);
  }, [cancelPromptOpen, uploads.length]);

  if (uploads.length === 0 || inLiveDebate) return null;

  return (
    <>
      <DebateRecordingUploadBanner
        count={uploads.length}
        waitingReason={waitingReason}
        errorMessage={latestFailedUpload?.lastError ?? null}
        publishChecked={!cancelPromptOpen}
        onUncheckPublish={() => setCancelPromptOpen(true)}
      />
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
  waitingReason,
  errorMessage,
  publishChecked,
  onUncheckPublish,
}: {
  count: number;
  waitingReason: DebateRecordingUploadWaitingReason;
  errorMessage: string | null;
  publishChecked: boolean;
  onUncheckPublish: () => void;
}) {
  const label = `${count} debate${count === 1 ? '' : 's'}`;
  let message = `Uploading ${label}`;
  if (waitingReason === 'offline') {
    message = `Waiting to upload ${label} — waiting for a connection`;
  } else if (waitingReason === 'retry' && errorMessage) {
    const failure = errorMessage.trim();
    const punctuation = /[.!?]$/.test(failure) ? '' : '.';
    message = `Waiting to upload ${label} — ${failure}${punctuation} Retrying automatically.`;
  } else if (waitingReason) {
    message = `Waiting to upload ${label}`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 flex min-w-0 items-center justify-center gap-2 bg-divider px-4 py-2 text-metadata text-grey-04 ${Z_LAYER_CLASS.toast}`}
    >
      <span className="min-w-0 truncate">{message}</span>
      <span aria-hidden="true" className="shrink-0">
        ·
      </span>
      <button
        type="button"
        role="checkbox"
        aria-checked={publishChecked}
        aria-label="Publish debate"
        onClick={() => {
          if (publishChecked) onUncheckPublish();
        }}
        className="inline-flex shrink-0 items-center gap-1.5 text-text"
      >
        Publish
        <span
          className={cx(
            'grid size-4 place-items-center rounded border transition-colors',
            publishChecked ? 'border-text bg-text text-white' : 'border-grey-03 bg-white text-transparent'
          )}
        >
          <Check />
        </span>
      </button>
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
    <div className={`fixed inset-0 grid place-items-center bg-black/40 px-6 ${Z_LAYER_CLASS.toast}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Don't want to publish?"
        className="w-full max-w-[360px] rounded-xl bg-white p-5 text-center text-text shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <Text as="h2" variant="smallTitle" color="text" className="flex-1 text-center">
            Don&apos;t want to publish?
          </Text>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-6 shrink-0 place-items-center rounded-full text-grey-04 hover:bg-grey-01"
          >
            <CloseSmall />
          </button>
        </div>
        <Text as="p" variant="metadata" color="grey-04" className="mt-2">
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
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-red-01 px-5 text-metadata text-white transition-colors hover:bg-red-01/90 disabled:opacity-50"
        >
          {busy ? 'Removing...' : 'Delete debate forever'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-full px-5 text-metadata text-text hover:bg-grey-01 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function recordingUploadDependencies(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
): RecordingUploadDependencies {
  return {
    createUpload: (debateId, request) =>
      createLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
    putRecording: putRecording,
    markUploaded: markDebateRecordingUploaded,
    completeUpload: (debateId, request) =>
      completeLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
    deleteUpload: deleteDebateRecordingUpload,
  };
}

async function putRecording(upload: LocalRecordingUploadResponse['upload'], blob: Blob, mimeType: string) {
  const headers = new Headers(upload.headers);
  headers.set('Content-Type', mimeType);
  const response = await fetch(upload.url, { method: upload.method, headers, body: blob });
  if (!response.ok) throw new Error(`Recording upload failed (${response.status})`);
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
