'use client';

import * as React from 'react';

import cx from 'classnames';

import { type AttachedStream, attachStreamSource } from '~/core/debates/stream-playback';
import { releaseVideo } from '~/core/utils/video/release-video';

import { Text } from '~/design-system/text';

import { useCallRecordingPlayback } from './hooks';

export const CALL_RECORDING_PLAYER_COPY = {
  loading: 'Loading recording…',
  failed: 'This recording can’t be played right now.',
  retry: 'Try again',
} as const;

/** Re-signs after a failed source before giving up. */
const MAX_SOURCE_RETRIES = 2;

/**
 * A call recording (GEO-3421): one <video> on Stream HLS through `attachStreamSource`, native on
 * Safari and iOS, hls.js elsewhere. Native controls own play, mute and full screen; nothing here
 * flips `muted` or adds a second element, which is what iOS refuses outside a gesture.
 *
 * The first signed URL is kept for the element's life, so a background re-sign never interrupts
 * playback. A failed source is re-signed and reattached at the same position.
 */
export function CallRecordingPlayer({
  callId,
  preload = 'metadata',
  poster,
  className,
}: {
  callId: string;
  /** `none` in a list, so a card nobody plays costs no manifest fetch on iOS. */
  preload?: 'none' | 'metadata';
  /** Defaults to the signed thumbnail that comes with the playback URL. */
  poster?: string | null;
  className?: string;
}) {
  const playback = useCallRecordingPlayback(callId, true);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [retries, setRetries] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const resumeAtRef = React.useRef<number | null>(null);
  const { refetch } = playback;

  // Adopt a URL only when none is attached: the first one, or one read after the last failure.
  const url = playback.data?.url ?? null;
  const [failedAt, setFailedAt] = React.useState(0);
  if (src === null && url !== null && playback.dataUpdatedAt > failedAt && !failed) setSrc(url);

  // hls.js and the element can both report one failure; only the first counts.
  const failedSrcRef = React.useRef<string | null>(null);
  const fail = React.useCallback(() => {
    if (!src || failedSrcRef.current === src) return;
    failedSrcRef.current = src;
    const video = videoRef.current;
    if (video && video.currentTime > 0) resumeAtRef.current = video.currentTime;
    setFailedAt(Date.now());
    setSrc(null);
    if (retries >= MAX_SOURCE_RETRIES) {
      setFailed(true);
      return;
    }
    setRetries(retries + 1);
    void refetch();
  }, [refetch, retries, src]);

  const failRef = React.useRef(fail);
  React.useEffect(() => {
    failRef.current = fail;
  }, [fail]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const resumeAt = resumeAtRef.current;
    const onMetadata = () => {
      if (resumeAt !== null) video.currentTime = resumeAt;
      resumeAtRef.current = null;
    };
    video.addEventListener('loadedmetadata', onMetadata, { once: true });
    const attached: AttachedStream = attachStreamSource(video, src, {
      autoStartLoad: false,
      onFatalError: () => failRef.current(),
    });
    return () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      attached.destroy();
      releaseVideo(video);
    };
  }, [src]);

  const retry = () => {
    setFailed(false);
    setFailedAt(Date.now());
    setRetries(0);
    void refetch();
  };

  const broken = failed || (playback.isError && !src);
  return (
    <div className={cx('relative w-full overflow-hidden bg-text', className ?? 'aspect-video rounded-xl')}>
      <video
        ref={videoRef}
        controls
        playsInline
        preload={preload}
        poster={poster ?? playback.data?.thumbnail_url ?? undefined}
        // Native HLS reports a lapsed or broken manifest here; hls.js reports through its own event.
        onError={fail}
        className={cx('size-full object-contain', broken && 'invisible')}
        data-testid="call-recording-video"
      />
      {broken ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <Text as="p" variant="metadata" color="white">
            {CALL_RECORDING_PLAYER_COPY.failed}
          </Text>
          <button
            type="button"
            onClick={retry}
            className="rounded-full border border-white/60 px-3 py-1 text-metadata text-white hover:bg-white/10"
          >
            {CALL_RECORDING_PLAYER_COPY.retry}
          </button>
        </div>
      ) : !src ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Text as="p" variant="metadata" color="grey-03">
            {CALL_RECORDING_PLAYER_COPY.loading}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
