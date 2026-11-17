import type { DebateMediaTurnSegment } from '../api';
import type { AudioPeaksReady, AudioPeaksStatus } from './api';
import { stretchesOrWhole } from './reel';

/**
 * The moments editor's waveform (GEO-3673). geo-chat serves each debater's peaks on the player's
 * clock, one byte per 10 ms bucket (`dbfs_u8`); the editor draws one waveform, the louder of the two
 * per bucket. Mics are gated, so that is close to the mix the player plays.
 */

/** One waveform on the player's clock: byte `i` is the loudest of bucket `i` (`i * bucketMs` ms on). */
export type MixedPeaks = { bucketMs: number; samples: Uint8Array; version: string };

/** Polled every 5 s while the peaks are built, every 15 s after two minutes, and not after ten. */
export const PEAKS_POLL_MS = 5_000;
export const PEAKS_SLOW_POLL_MS = 15_000;
export const PEAKS_BACKOFF_AFTER_MS = 2 * 60_000;
export const PEAKS_GIVE_UP_MS = 10 * 60_000;

/** How long until the next read of peaks being built, `elapsedMs` into the wait; `false` to stop. */
export function peaksPollDelay(elapsedMs: number): number | false {
  if (elapsedMs >= PEAKS_GIVE_UP_MS) return false;
  const delay = elapsedMs < PEAKS_BACKOFF_AFTER_MS ? PEAKS_POLL_MS : PEAKS_SLOW_POLL_MS;
  // The last read lands on the ten minutes, so the wait ends on what the worker says then.
  return Math.min(delay, PEAKS_GIVE_UP_MS - elapsedMs);
}

export function isPeaksWaiting(status: AudioPeaksStatus | null | undefined): boolean {
  return status?.status === 'queued' || status?.status === 'running';
}

function base64Bytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The louder of the lanes in each bucket; as long as the longest lane. */
export function mixLanes(lanes: readonly Uint8Array[]): Uint8Array {
  const mixed = new Uint8Array(Math.max(0, ...lanes.map(lane => lane.length)));
  for (const lane of lanes) {
    for (let i = 0; i < lane.length; i += 1) if (lane[i] > mixed[i]) mixed[i] = lane[i];
  }
  return mixed;
}

/**
 * A ready answer's lanes, mixed into one waveform. `null` when it is not one the editor can read: a
 * scale it doesn't know, or bytes that don't decode. A lane reaching past the bytes is cut short.
 */
export function decodePeaks(ready: AudioPeaksReady): MixedPeaks | null {
  if (ready.scale !== 'dbfs_u8' || !(ready.bucket_ms > 0) || !Array.isArray(ready.lanes)) return null;
  let bytes: Uint8Array;
  try {
    bytes = base64Bytes(ready.data);
  } catch {
    return null;
  }
  const lanes = ready.lanes.map(lane =>
    bytes.subarray(
      Math.max(0, lane.offset),
      Math.min(bytes.length, Math.max(0, lane.offset) + Math.max(0, lane.samples))
    )
  );
  return { bucketMs: ready.bucket_ms, samples: mixLanes(lanes), version: ready.version };
}

/**
 * The waveform from `startMs` to `endMs` in `columns` columns: each the loudest bucket it covers,
 * so a short loud sound is never averaged away. A column with no bucket (before the debate, past the
 * peaks' end) is `0`, silence.
 */
export function peakColumns(
  peaks: Pick<MixedPeaks, 'bucketMs' | 'samples'>,
  startMs: number,
  endMs: number,
  columns: number
): Uint8Array {
  const count = Math.max(0, Math.floor(columns));
  const out = new Uint8Array(count);
  if (count === 0 || !(endMs > startMs)) return out;
  const { bucketMs, samples } = peaks;
  const msPerColumn = (endMs - startMs) / count;
  for (let column = 0; column < count; column += 1) {
    const from = startMs + column * msPerColumn;
    const first = Math.max(0, Math.floor(from / bucketMs));
    // At least the bucket under the column, however narrow the column.
    const last = Math.min(samples.length, Math.max(first + 1, Math.ceil((from + msPerColumn) / bucketMs)));
    let peak = 0;
    for (let bucket = first; bucket < last; bucket += 1) if (samples[bucket] > peak) peak = samples[bucket];
    out[column] = peak;
  }
  return out;
}

/**
 * The stretches of the player's clock the render cut from the video (pick windows, condensed breaks,
 * an early end's quiet): what lies between the real-speed stretches. A fixed-format render cut
 * nothing, so it has none.
 */
export function cutStretches(
  turns: readonly DebateMediaTurnSegment[],
  durationMs: number
): { start_ms: number; end_ms: number }[] {
  const kept = stretchesOrWhole(turns, durationMs)
    .map(stretch => ({ start_ms: Math.max(0, stretch.start_ms), end_ms: Math.min(durationMs, stretch.end_ms) }))
    .filter(stretch => stretch.end_ms > stretch.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms);
  const cuts: { start_ms: number; end_ms: number }[] = [];
  let at = 0;
  for (const stretch of kept) {
    if (stretch.start_ms > at) cuts.push({ start_ms: at, end_ms: stretch.start_ms });
    at = Math.max(at, stretch.end_ms);
  }
  if (at < durationMs) cuts.push({ start_ms: at, end_ms: durationMs });
  return cuts;
}

/** The fine-tune panel's window: the clip with `padMs` either side, kept inside the debate. */
export function fineWindow(
  clip: { start_ms: number; end_ms: number },
  durationMs: number,
  padMs: number
): { start_ms: number; end_ms: number } {
  const start = Math.max(0, clip.start_ms - padMs);
  const end = Math.min(Math.max(durationMs, clip.end_ms), clip.end_ms + padMs);
  return { start_ms: start, end_ms: Math.max(end, start + 1) };
}

/** `m:ss.ss`: the panel places an edge to 10 ms, so it shows hundredths. */
export function formatFineTime(ms: number): string {
  const hundredths = Math.round(Math.max(0, ms) / 10);
  const minutes = Math.floor(hundredths / 6_000);
  const seconds = (hundredths % 6_000) / 100;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function formatWait(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** What the editor shows of the peaks: the waveform, or one line why there is none (yet). */
export type PeaksView =
  | { kind: 'loading' }
  | { kind: 'waiting'; message: string }
  | { kind: 'gave-up'; message: string }
  | { kind: 'ready'; peaks: MixedPeaks }
  | { kind: 'none'; message: string };

export const NO_WAVEFORM = 'No waveform for this debate.';

/**
 * The peaks read as the editor shows them. `status` is `null` for a geo-chat without the route (a
 * 404), which, like any error, means no waveform: the editor works the same without one.
 */
export function peaksView({
  status,
  failed,
  pending,
  gaveUp,
  peaks,
}: {
  status: AudioPeaksStatus | null | undefined;
  failed: boolean;
  pending: boolean;
  gaveUp: boolean;
  peaks: MixedPeaks | null;
}): PeaksView {
  if (status === undefined) {
    if (pending && !failed) return { kind: 'loading' };
    return { kind: 'none', message: NO_WAVEFORM };
  }
  if (status === null) return { kind: 'none', message: NO_WAVEFORM };
  switch (status.status) {
    case 'ready':
      return peaks ? { kind: 'ready', peaks } : { kind: 'none', message: NO_WAVEFORM };
    case 'queued':
    case 'running':
      if (gaveUp) {
        return {
          kind: 'gave-up',
          message:
            'Still waiting for the media worker, which may be busy with other debates. Reopen the editor later to check again.',
        };
      }
      return {
        kind: 'waiting',
        message: `Preparing the waveform… (waiting ${formatWait(status.waiting_s ?? 0)})`,
      };
    case 'unavailable':
      if (status.reason === 'media_job_active') {
        return {
          kind: 'none',
          message: "The debate's media is still processing. Reopen the editor when it's done for its waveform.",
        };
      }
      return { kind: 'none', message: NO_WAVEFORM };
    case 'failed': {
      const retry = !status.permanent && status.retry_after ? new Date(status.retry_after) : null;
      if (retry && !Number.isNaN(retry.getTime())) {
        return {
          kind: 'none',
          message: `${NO_WAVEFORM} Reopen the editor after ${retry.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to try again.`,
        };
      }
      return { kind: 'none', message: NO_WAVEFORM };
    }
    default:
      return { kind: 'none', message: NO_WAVEFORM };
  }
}
