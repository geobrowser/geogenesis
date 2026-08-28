'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';

import { useDebateMediaArtifactUrl } from './hooks';

type PreparationStatus = 'preparing' | 'ready' | 'error';

export type SocialVideoHandoffMethod = 'native_share' | 'download';

export type PreparedSocialVideo = {
  status: PreparationStatus;
  previewUrl: string | null;
  previewFailed: boolean;
  file: File | null;
  playbackUrl: string | null;
  downloadUrl: string | null;
  progressPercent: number | null;
  error: string | null;
  retry: () => void;
};

type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
};

const SOCIAL_VIDEO_DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

const EMPTY_PREPARED_SOCIAL_VIDEO: Omit<PreparedSocialVideo, 'retry'> = {
  status: 'preparing',
  previewUrl: null,
  previewFailed: false,
  file: null,
  playbackUrl: null,
  downloadUrl: null,
  progressPercent: null,
  error: null,
};

export function usePreparedSocialVideo(
  debateId: string,
  { enabled, includePreview }: { enabled: boolean; includePreview: boolean }
): PreparedSocialVideo {
  const previewArtifact = useDebateMediaArtifactUrl();
  const videoArtifact = useDebateMediaArtifactUrl();
  const previewMutateRef = React.useRef(previewArtifact.mutate);
  const videoMutateRef = React.useRef(videoArtifact.mutate);
  const playbackDebateIdRef = React.useRef<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  const [state, setState] = React.useState<Omit<PreparedSocialVideo, 'retry'>>(EMPTY_PREPARED_SOCIAL_VIDEO);

  React.useEffect(() => {
    previewMutateRef.current = previewArtifact.mutate;
  }, [previewArtifact.mutate]);

  React.useEffect(() => {
    videoMutateRef.current = videoArtifact.mutate;
  }, [videoArtifact.mutate]);

  React.useEffect(() => {
    if (!enabled) {
      playbackDebateIdRef.current = null;
      setState(EMPTY_PREPARED_SOCIAL_VIDEO);
      return;
    }

    let active = true;
    let downloadUrl: string | null = null;
    const controller = new AbortController();
    const retainPlayback = playbackDebateIdRef.current === debateId;
    playbackDebateIdRef.current = debateId;
    setState(current => ({
      status: 'preparing',
      previewUrl: retainPlayback ? current.previewUrl : null,
      previewFailed: false,
      file: null,
      playbackUrl: retainPlayback ? current.playbackUrl : null,
      downloadUrl: null,
      progressPercent: null,
      error: null,
    }));

    if (includePreview) {
      previewMutateRef.current(
        { debateId, request: { kind: 'social_preview_image' } },
        {
          onSuccess: response => {
            if (active) setState(current => ({ ...current, previewUrl: response.upload.url }));
          },
          onError: () => {
            if (!active) return;
            captureSocialVideoEvent('debate_social_video_preparation_failed', {
              debate_id: debateId,
              stage: 'preview_url',
            });
            setState(current => ({ ...current, previewFailed: true }));
          },
        }
      );
    }

    videoMutateRef.current(
      { debateId, request: { kind: 'social_video' } },
      {
        onSuccess: response => {
          if (!active) return;
          setState(current => (current.playbackUrl ? current : { ...current, playbackUrl: response.upload.url }));
          void downloadSocialVideo(response.upload.url, controller.signal, progress => {
            if (!active) return;
            const progressPercent = progress.totalBytes
              ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
              : null;
            setState(current =>
              current.progressPercent === progressPercent ? current : { ...current, progressPercent }
            );
          })
            .then(blob => {
              if (!active) return;
              const file = new File([blob], `debate-${debateId}-social.mp4`, {
                type: 'video/mp4',
                lastModified: Date.now(),
              });
              downloadUrl = URL.createObjectURL(file);
              setState(current => ({
                ...current,
                status: 'ready',
                file,
                downloadUrl,
                progressPercent: 100,
                error: null,
              }));
            })
            .catch(error => {
              if (!active || isAbortError(error)) return;
              captureSocialVideoEvent('debate_social_video_preparation_failed', {
                debate_id: debateId,
                stage: 'video_download',
                error_name: errorName(error),
              });
              setState(current => ({
                ...current,
                status: 'error',
                error: error instanceof Error ? error.message : 'Could not prepare the social video.',
              }));
            });
        },
        onError: error => {
          if (!active) return;
          captureSocialVideoEvent('debate_social_video_preparation_failed', {
            debate_id: debateId,
            stage: 'video_url',
            error_name: errorName(error),
          });
          setState(current => ({
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not prepare the social video.',
          }));
        },
      }
    );

    return () => {
      active = false;
      controller.abort();
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [debateId, enabled, includePreview, retryCount]);

  return {
    ...state,
    retry: () => setRetryCount(count => count + 1),
  };
}

export async function handoffPreparedSocialVideo({
  debateId,
  title,
  file,
  downloadUrl,
}: {
  debateId: string;
  title: string;
  file: File;
  downloadUrl: string;
}): Promise<SocialVideoHandoffMethod> {
  const method = getPreparedSocialVideoHandoffMethod(file);

  try {
    if (method === 'native_share') {
      try {
        const sharePromise = navigator.share({ title, files: [file] });
        await sharePromise;
      } catch (error) {
        // `navigator.canShare({ files })` chose this path, but it is a *hint* — it answers whether
        // the data is shareable in principle, not whether this browser will actually accept it. So
        // `share()` can still refuse, and Preston hit exactly that: "Failed to execute 'share' on
        // 'Navigator': Permission denied".
        //
        // Static causes were ruled out before adding this: the click reaches `share()` with no
        // intervening await, so transient activation is intact, and no `Permissions-Policy` header
        // is set anywhere (`web-share` is policy-gated, and a block reads as this same error). What
        // remains is the browser refusing a file share it said it could do.
        if (isAbortError(error)) throw error; // They closed the share sheet. Respect that.

        // Only a refusal a retry cannot change falls back. This distinction is the whole of the
        // change: the existing behaviour — surface the error, keep a retry that reuses the prepared
        // file — is right for a transient failure and is deliberately left alone. It is wrong only
        // where retrying reproduces the same refusal forever, which is what a capability rejection
        // does: the retry button then looks like a remedy and is a dead end.
        if (!isUnretryableShareError(error)) throw error;

        downloadPreparedVideo(downloadUrl, file.name);
        captureSocialVideoEvent('debate_social_video_handoff_resolved', {
          debate_id: debateId,
          method: 'download',
          // So the rate of this is visible rather than inferred from an absence of share events.
          fell_back_from: 'native_share',
          error_name: errorName(error),
        });
        return 'download';
      }
    } else {
      downloadPreparedVideo(downloadUrl, file.name);
    }

    captureSocialVideoEvent('debate_social_video_handoff_resolved', {
      debate_id: debateId,
      method,
    });
    return method;
  } catch (error) {
    if (!isAbortError(error)) {
      captureSocialVideoEvent('debate_social_video_handoff_failed', {
        debate_id: debateId,
        method,
        error_name: errorName(error),
      });
    }
    throw error;
  }
}

export function getPreparedSocialVideoHandoffMethod(file: File): SocialVideoHandoffMethod {
  if (typeof navigator === 'undefined') return 'download';
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return 'download';
  try {
    return navigator.canShare({ files: [file] }) ? 'native_share' : 'download';
  } catch {
    return 'download';
  }
}

export async function downloadSocialVideo(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void,
  stallTimeoutMs = SOCIAL_VIDEO_DOWNLOAD_STALL_TIMEOUT_MS
): Promise<Blob> {
  const requestController = new AbortController();
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const abortRequest = () => requestController.abort(signal.reason);
  const resetStallTimer = () => {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = setTimeout(
      () => {
        stalled = true;
        requestController.abort();
      },
      Math.max(1, stallTimeoutMs)
    );
  };

  if (signal.aborted) abortRequest();
  else signal.addEventListener('abort', abortRequest, { once: true });
  resetStallTimer();

  try {
    const response = await fetch(url, { signal: requestController.signal });
    resetStallTimer();
    if (!response.ok) {
      throw new Error(`Could not download the social video (${response.status}).`);
    }

    const totalBytesHeader = response.headers.get('content-length');
    const parsedTotalBytes = totalBytesHeader ? Number(totalBytesHeader) : Number.NaN;
    const totalBytes = Number.isFinite(parsedTotalBytes) && parsedTotalBytes > 0 ? parsedTotalBytes : null;
    onProgress({ receivedBytes: 0, totalBytes });

    if (!response.body) {
      const blob = await response.blob();
      assertCompleteVideoDownload(blob.size, totalBytes);
      onProgress({ receivedBytes: blob.size, totalBytes });
      return blob.type === 'video/mp4' ? blob : new Blob([blob], { type: 'video/mp4' });
    }

    reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetStallTimer();
      if (!value) continue;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
      receivedBytes += value.byteLength;
      onProgress({ receivedBytes, totalBytes });
    }

    assertCompleteVideoDownload(receivedBytes, totalBytes);
    return new Blob(chunks, { type: 'video/mp4' });
  } catch (error) {
    if (stalled) throw new Error('Video preparation stalled. Check your connection and try again.');
    if (error instanceof TypeError) {
      throw new Error('Could not download the social video. Check your connection and try again.');
    }
    throw error;
  } finally {
    if (stallTimer !== null) clearTimeout(stallTimer);
    signal.removeEventListener('abort', abortRequest);
    reader?.releaseLock();
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

/**
 * Share refusals that a retry cannot change.
 *
 * `NotAllowedError` is the browser declining the capability — a policy block, or a platform that
 * cannot share files despite `canShare` saying it could. `NotSupportedError` is the same shape.
 * Either way the next attempt refuses identically, so offering a retry offers nothing.
 *
 * Everything else keeps the existing retry path, because it might succeed.
 */
const UNRETRYABLE_SHARE_ERROR_NAMES = new Set(['NotAllowedError', 'NotSupportedError']);

export function isUnretryableShareError(error: unknown): boolean {
  return UNRETRYABLE_SHARE_ERROR_NAMES.has(errorName(error));
}

/**
 * The error's own name, for telemetry.
 *
 * Read structurally rather than behind `instanceof Error`, which is what every call site here used
 * to do — and `DOMException` is **not** an instance of `Error`. Since the Web Share API and the
 * fetch abort path both reject with `DOMException`, that guard reported every one of them as
 * `UnknownError`: the share failure Preston hit arrived as a person telling us the string, because
 * `NotAllowedError` never reached the event. `isAbortError` above already reads `.name` this way,
 * which is why cancellation detection worked while the reporting beside it did not.
 */
export function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return 'UnknownError';
}

export function captureSocialVideoEvent(eventName: string, properties: Record<string, unknown>) {
  try {
    capture(eventName, properties);
  } catch {
    // Analytics is best-effort and must not change preparation or sharing semantics.
  }
}

function downloadPreparedVideo(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}

function assertCompleteVideoDownload(receivedBytes: number, totalBytes: number | null) {
  if (receivedBytes <= 0 || (totalBytes !== null && receivedBytes !== totalBytes)) {
    throw new Error('The social video download was incomplete.');
  }
}
