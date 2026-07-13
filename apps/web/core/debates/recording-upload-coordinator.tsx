'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import { CloseSmall } from '~/design-system/icons/close-small';

import {
  type GetPrivyIdentityToken,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type LocalRecordingUploadResponse,
  completeLocalRecordingUpload,
  createLocalRecordingUpload,
  resolveCurrentGeoChatUserId,
} from './api';
import { debateQueryKeys, useGeoChatAuth } from './hooks';
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
  let filename = upload.filename;
  if (upload.stage === 'queued' || !filename) {
    const target = await dependencies.createUpload(upload.debateId, {
      mime_type: upload.mimeType,
      started_at_ms: upload.startedAtMs,
    });
    await dependencies.putRecording(target.upload, upload.blob, upload.mimeType);
    filename = target.filename;
    await dependencies.markUploaded(upload.id, filename);
  }

  await dependencies.completeUpload(upload.debateId, {
    filename,
    mime_type: upload.mimeType,
    started_at_ms: upload.startedAtMs,
    ended_at_ms: upload.endedAtMs,
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
  const { ready, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const [userId, setUserId] = React.useState<string | null>(null);
  const [uploads, setUploads] = React.useState<DebateRecordingUpload[]>([]);
  const [activeUploadId, setActiveUploadId] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [wakeAt, setWakeAt] = React.useState(() => Date.now());
  const [identityRetrySignal, setIdentityRetrySignal] = React.useState(0);
  const [toastDismissed, setToastDismissed] = React.useState(false);
  const activeUploadIdRef = React.useRef<string | null>(null);
  const lockRetryAtRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !authenticated) {
      setUserId(null);
      setUploads([]);
      return;
    }
    setUserId(null);
    setUploads([]);
    let cancelled = false;
    let retryTimer: number | null = null;
    void resolveCurrentGeoChatUserId(getPrivyIdentityToken)
      .then(id => {
        if (!id) throw new Error('The debate upload user could not be resolved.');
        if (!cancelled) setUserId(id);
      })
      .catch(error => {
        console.warn('[DebateRecordingUploadCoordinator] could not resolve user:', error);
        if (!cancelled) {
          retryTimer = window.setTimeout(() => setIdentityRetrySignal(current => current + 1), initialRetryDelayMs);
        }
      });
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [authenticated, getPrivyIdentityToken, identityRetrySignal, ready]);

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
    const dependencies = recordingUploadDependencies(getPrivyIdentityToken);
    void withRecordingUploadLock(async () => {
      const latestUpload = await getDebateRecordingUpload(upload.id);
      if (!latestUpload || latestUpload.userId !== userId) return;
      await processDebateRecordingUpload(latestUpload, dependencies);
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
        const nextAttemptAt = Date.now() + recordingUploadRetryDelay(upload.attemptCount);
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
  }, [activeUploadId, getPrivyIdentityToken, online, queryClient, uploads, userId, wakeAt]);

  const waiting = !online || (!activeUploadId && uploads.every(upload => upload.nextAttemptAt > Date.now()));
  if (uploads.length === 0 || toastDismissed) return null;

  return (
    <DebateRecordingUploadPill count={uploads.length} waiting={waiting} onDismiss={() => setToastDismissed(true)} />
  );
}

export function DebateRecordingUploadPill({
  count,
  waiting,
  onDismiss,
}: {
  count: number;
  waiting: boolean;
  onDismiss: () => void;
}) {
  const label = `${count} debate${count === 1 ? '' : 's'}`;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-16 left-1/2 inline-flex -translate-x-1/2 items-center gap-3 rounded-full border border-grey-02 bg-white py-2 pr-2 pl-3 text-sm font-medium whitespace-nowrap text-text shadow-card ${Z_LAYER_CLASS.toast}`}
    >
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-grey-02 border-t-grey-04" />
      <span>{waiting ? `Waiting to upload ${label}` : `Uploading ${label}`}</span>
      <button
        type="button"
        aria-label="Hide recording upload status"
        onClick={onDismiss}
        className="grid size-7 place-items-center rounded-full text-grey-04 hover:bg-grey-01"
      >
        <CloseSmall />
      </button>
    </div>
  );
}

function recordingUploadDependencies(getPrivyIdentityToken: GetPrivyIdentityToken): RecordingUploadDependencies {
  return {
    createUpload: (debateId, request) => createLocalRecordingUpload(debateId, request, getPrivyIdentityToken),
    putRecording: putRecording,
    markUploaded: markDebateRecordingUploaded,
    completeUpload: (debateId, request) => completeLocalRecordingUpload(debateId, request, getPrivyIdentityToken),
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
