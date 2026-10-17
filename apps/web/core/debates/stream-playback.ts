import { GeoChatRequestError } from './api';
import type { DebateRecording } from './api';
import type { RecordingPlaybackVariant } from './mobile-rendition';

/**
 * Whether debates play from Cloudflare Stream. Off unless `NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK` is
 * `1`, and with it off nothing here is asked for: every request and every element is what it was.
 *
 * geo-chat copies each recording to Stream and reports two things per recording:
 * - `preview_ready`: a 4-second muted MP4 clip of the debater exists. A held feed card loops it in
 *   place of the still, and keeps looping it after a tap on another card.
 * - `stream_ready`: the whole recording is available as adaptive HLS. Full playback (the tap, and
 *   the debate page) plays that instead of the raw WebM.
 *
 * Either can be ready for one debater before the other, so every decision here is per slot.
 *
 * Turn this on only after it has been watched on a real iPhone, on a preview deployment. The last
 * mobile playback change (#2707) froze video within minutes of shipping and was reverted, and a
 * second element source on iOS is exactly the kind of change that needs a device to prove.
 */
export const DEBATE_STREAM_PLAYBACK_ENABLED = process.env.NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK === '1';

/** Every `variant` geo-chat's `POST /debates/:id/recordings/url` signs; absent means the recording. */
export type RecordingUrlVariant = RecordingPlaybackVariant | 'stream' | 'preview';

/** Which file full playback asks for first. `stream` falls back to the mobile rendition, then the recording. */
export type FullPlaybackVariant = RecordingPlaybackVariant | 'stream';

type Readiness = Pick<DebateRecording, 'stream_ready' | 'preview_ready'> | null | undefined;

/** `stream` when the flag is on and geo-chat says this recording's HLS copy exists. */
export function recordingStreamVariant(
  recording: Readiness,
  { enabled = DEBATE_STREAM_PLAYBACK_ENABLED }: { enabled?: boolean } = {}
): 'stream' | undefined {
  return enabled && recording?.stream_ready === true ? 'stream' : undefined;
}

/** Whether this recording has a preview clip to sign, with the flag on. */
export function recordingHasPreview(
  recording: Readiness,
  { enabled = DEBATE_STREAM_PLAYBACK_ENABLED }: { enabled?: boolean } = {}
): boolean {
  return enabled && recording?.preview_ready === true;
}

/**
 * The refusals that mean "this variant is not available", as opposed to a network failure.
 *
 * Callers fall back on any failure — a Stream copy is an optimisation, never a reason to show a
 * load error for a debate that plays — but these are the ones expected in normal operation, so
 * they are the ones worth naming: no signer configured (`stream_not_configured`), a signer that
 * failed (`stream_signing_failed`), and a copy that is not ready yet (`recording_variant_not_found`).
 */
export function isStreamUnavailableError(error: unknown): boolean {
  return (
    error instanceof GeoChatRequestError &&
    (error.code === 'stream_not_configured' ||
      error.code === 'stream_signing_failed' ||
      error.code === 'recording_variant_not_found')
  );
}

const HLS_MIME = 'application/vnd.apple.mpegurl';

/**
 * Whether this browser plays HLS itself: Safari, and every browser on iOS, which are WebKit.
 *
 * Asked before hls.js, never after: on iOS hls.js would run over Managed Media Source where it
 * exists and fail where it does not, and native playback is the path iOS's audio rules
 * (see `activateBothInGesture`) were measured on.
 */
export function canPlayNativeHls(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('video').canPlayType(HLS_MIME) !== '';
  } catch {
    return false;
  }
}

/** A Stream source attached to an element, for the element's owner to release. */
export type AttachedStream = {
  /** Start fetching segments, for a source attached without (see `autoStartLoad`). Idempotent. */
  startLoad: () => void;
  /** Stop fetching and let the element go. Safe to call before the attach has finished. */
  destroy: () => void;
};

type HlsModule = typeof import('hls.js');

/** Kept in its own function so tests can see exactly when, and whether, hls.js is fetched. */
export function loadHls(): Promise<HlsModule> {
  return import('hls.js');
}

/**
 * Point a <video> at a Stream HLS manifest.
 *
 * Native HLS (Safari, iOS) gets the manifest as `src`, exactly like any other URL — no library.
 * Everywhere else hls.js is imported here and nowhere else, so it is fetched only once a viewer
 * has asked to watch a debate whose Stream copy is ready: it is never in the feed's or the page's
 * entry chunks. A browser with neither (no Media Source) gets the manifest as `src` too, which
 * fails into the element's own error handling and from there into a re-sign.
 *
 * `autoStartLoad: false` is the HLS spelling of `preload="metadata"`: hls.js otherwise ignores
 * `preload` and buffers 30 seconds of a card nobody has reached. The first `play` starts it.
 */
export function attachStreamSource(
  video: HTMLVideoElement,
  url: string,
  {
    autoStartLoad = true,
    onFatalError,
    nativeHls = canPlayNativeHls(),
    load = loadHls,
  }: {
    autoStartLoad?: boolean;
    onFatalError?: () => void;
    nativeHls?: boolean;
    load?: () => Promise<HlsModule>;
  } = {}
): AttachedStream {
  if (nativeHls) {
    if (video.getAttribute('src') !== url) video.setAttribute('src', url);
    return { startLoad: () => {}, destroy: () => {} };
  }

  let destroyed = false;
  let started = autoStartLoad;
  let hls: InstanceType<HlsModule['default']> | null = null;
  const onPlay = () => startLoad();
  function startLoad() {
    if (started) return;
    started = true;
    hls?.startLoad();
  }

  void load().then(
    ({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        video.setAttribute('src', url);
        return;
      }
      hls = new Hls({ autoStartLoad: started });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) onFatalError?.();
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    },
    () => {
      if (!destroyed) onFatalError?.();
    }
  );
  if (!started) video.addEventListener('play', onPlay, { once: true });

  return {
    startLoad,
    destroy: () => {
      destroyed = true;
      video.removeEventListener('play', onPlay);
      hls?.destroy();
      hls = null;
    },
  };
}

/** A recording's start on the debate's wall clock plus where its clip starts, in milliseconds. */
export function previewClipStartMs(
  recording: Pick<DebateRecording, 'started_at_ms' | 'preview_start_seconds'> | null | undefined
): number | null {
  if (!recording || typeof recording.started_at_ms !== 'number') return null;
  return recording.started_at_ms + (recording.preview_start_seconds ?? 0) * 1_000;
}

/**
 * How far ahead slot 2's clip has to run of slot 1's to show the same instant, in seconds.
 *
 * Both clips cover the same window of the debate, cut on whole seconds of each recording, so what
 * is left between them is the gap between the two recordings' own starts (under half a second).
 * Positive when slot 1's clip starts later on the wall clock: slot 2 is then behind and has to sit
 * further in. Zero when either start is unknown, which is what the pair would show unaligned.
 */
export function previewPairOffsetSeconds(
  slot1: Pick<DebateRecording, 'started_at_ms' | 'preview_start_seconds'> | null | undefined,
  slot2: Pick<DebateRecording, 'started_at_ms' | 'preview_start_seconds'> | null | undefined
): number {
  const start1 = previewClipStartMs(slot1);
  const start2 = previewClipStartMs(slot2);
  if (start1 === null || start2 === null) return 0;
  return (start1 - start2) / 1_000;
}
