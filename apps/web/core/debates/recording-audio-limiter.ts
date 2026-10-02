import { capture } from '~/core/analytics';

/**
 * A limiter on the audio the local `MediaRecorder` encodes (GEO-3118). Off unless
 * `NEXT_PUBLIC_DEBATE_RECORDING_LIMITER` is `1`.
 *
 * Browser AGC plus Krisp drive loud words to full scale before MediaRecorder sees them, and Opus
 * then decodes those to peaks of ~1.45: measured on real recordings, ~10-13% of speaking seconds
 * clip, which is the crackle heard on every device. Attenuating a few dB and limiting just under
 * full scale before the encoder stops new recordings from clipping at the source.
 *
 * Only the recorded copy is processed. The track published to LiveKit is untouched, so the live
 * call sounds exactly as it does today. Read at call time, not import time, so tests can stub it;
 * Next still inlines the value into the client bundle.
 */
export function isRecordingAudioLimiterEnabled(value = process.env.NEXT_PUBLIC_DEBATE_RECORDING_LIMITER) {
  return value === '1';
}

/**
 * Note that `DynamicsCompressorNode` applies its own makeup gain (~+1.1 dB at these settings), so
 * speech lands about 3 dB quieter than the input rather than 4. Peaks are what matters here: a
 * downloaded recording must decode below 1.0.
 */
export const RECORDING_LIMITER_SETTINGS = {
  preGainDb: -4,
  thresholdDb: -2,
  ratio: 20,
  kneeDb: 0,
  attackSeconds: 0.002,
  releaseSeconds: 0.08,
} as const;

export type RecordingLimiterFallbackReason = 'no_audio_context' | 'audio_context_not_running' | 'graph_failed';

export type RecordingAudioLimiter = {
  /** What the recorder should record: the original stream, or its video plus the limited audio. */
  stream: MediaStream;
  limited: boolean;
  /** Idempotent. Disconnects the graph, stops the processed track, closes a context it created. */
  dispose: () => void;
};

type AudioContextLike = Pick<
  AudioContext,
  'state' | 'createMediaStreamSource' | 'createGain' | 'createDynamicsCompressor' | 'createMediaStreamDestination'
> & { close?: () => Promise<void> };

/** How often to look for the source microphone having been stopped; see `watchSourceEnded`. */
const SOURCE_ENDED_POLL_MS = 1_000;

function defaultCreateAudioContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass({ latencyHint: 'interactive' });
}

export function reportRecordingLimiterFallback({
  debateId,
  reason,
  error,
}: {
  debateId: string;
  reason: RecordingLimiterFallbackReason;
  error?: unknown;
}) {
  const errorLike = typeof error === 'object' && error !== null && 'name' in error && 'message' in error;
  console.warn(
    `[DebateRecording] audio limiter unavailable (${reason}); recording the unprocessed stream.`,
    error ?? ''
  );
  try {
    capture('debate_recording_limiter_fallback', {
      debate_id: debateId,
      reason,
      error_name: error === undefined ? null : errorLike ? String(error.name) : 'UnknownError',
      error_message: error === undefined ? null : errorLike ? String(error.message) : String(error),
    });
  } catch {
    // Analytics is best-effort and must never affect capture.
  }
}

/**
 * Returns the stream the local recorder should record. With the flag off this is `stream` itself,
 * byte-for-byte today's behaviour. With it on, the single audio track is routed
 * source -> gain -> limiter -> destination, and the recorder gets the original video track plus the
 * destination's track.
 *
 * Never throws and never blocks: any failure, or a context that is not already `running`, records
 * the original stream and reports why. It deliberately does not `await resume()` — capture start is
 * on the debate clock (GEO-2644), and a context that only a gesture could resume (iOS) would
 * otherwise record silence. `audioContext` should be the room's: LiveKit resumes it on connect and
 * Krisp already runs in it, so when Krisp is active the recorded audio depends on it either way.
 *
 * Mic gating still silences the recording: the source node reads the very `MediaStreamTrack` that
 * `setLocalTrackPreferences` disables (not a clone, which would carry its own `enabled`), and a
 * disabled track feeds Web Audio exact zeros, which gain and compression keep at zero.
 */
export function prepareRecordingStream({
  stream,
  debateId,
  enabled = isRecordingAudioLimiterEnabled(),
  audioContext,
  createAudioContext = defaultCreateAudioContext,
  report = reportRecordingLimiterFallback,
}: {
  stream: MediaStream;
  debateId: string;
  enabled?: boolean;
  audioContext?: AudioContextLike | null;
  createAudioContext?: () => AudioContextLike | null;
  report?: typeof reportRecordingLimiterFallback;
}): RecordingAudioLimiter {
  const passthrough: RecordingAudioLimiter = { stream, limited: false, dispose: () => undefined };
  if (!enabled) return passthrough;

  const audioTracks = stream.getAudioTracks();
  // Nothing to limit, or a shape this was not written for: leave it alone.
  if (audioTracks.length !== 1) return passthrough;
  const sourceTrack = audioTracks[0];

  let context: AudioContextLike | null = null;
  let ownsContext = false;
  try {
    if (audioContext && audioContext.state === 'running') {
      context = audioContext;
    } else {
      context = createAudioContext();
      ownsContext = context !== null;
    }
  } catch (error) {
    report({ debateId, reason: 'no_audio_context', error });
    return passthrough;
  }
  if (!context) {
    report({ debateId, reason: 'no_audio_context' });
    return passthrough;
  }

  const closeOwnedContext = () => {
    if (!ownsContext) return;
    try {
      void context?.close?.().catch(() => undefined);
    } catch {
      // Already closed.
    }
  };

  if (context.state !== 'running') {
    closeOwnedContext();
    report({ debateId, reason: 'audio_context_not_running' });
    return passthrough;
  }

  const nodes: AudioNode[] = [];
  let processedTrack: MediaStreamTrack | undefined;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (pollTimer !== null) clearInterval(pollTimer);
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Never connected.
      }
    }
    try {
      processedTrack?.stop();
    } catch {
      // Already stopped.
    }
    closeOwnedContext();
  };

  try {
    const settings = RECORDING_LIMITER_SETTINGS;
    const source = context.createMediaStreamSource(new MediaStream([sourceTrack]));
    nodes.push(source);
    const gain = context.createGain();
    nodes.push(gain);
    gain.gain.value = Math.pow(10, settings.preGainDb / 20);
    const limiter = context.createDynamicsCompressor();
    nodes.push(limiter);
    limiter.threshold.value = settings.thresholdDb;
    limiter.knee.value = settings.kneeDb;
    limiter.ratio.value = settings.ratio;
    limiter.attack.value = settings.attackSeconds;
    limiter.release.value = settings.releaseSeconds;
    const destination = context.createMediaStreamDestination();
    nodes.push(destination);

    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(destination);

    processedTrack = destination.stream.getAudioTracks()[0];
    if (!processedTrack) throw new Error('MediaStreamAudioDestinationNode produced no audio track');

    const recordedStream = new MediaStream([...stream.getVideoTracks(), processedTrack]);
    pollTimer = watchSourceEnded(sourceTrack, dispose);
    return { stream: recordedStream, limited: true, dispose };
  } catch (error) {
    dispose();
    report({ debateId, reason: 'graph_failed', error });
    return passthrough;
  }
}

/**
 * Today, stopping the local tracks leaves the recorded stream inactive and the recorder stops
 * itself. A destination track would outlive its source and keep the stream alive, so stop it once
 * the microphone has gone. Polled because `ended` does not fire for a local `track.stop()`, which
 * is how the room tears down.
 */
function watchSourceEnded(sourceTrack: MediaStreamTrack, onEnded: () => void) {
  if (sourceTrack.readyState === undefined) return null;
  return setInterval(() => {
    if (sourceTrack.readyState === 'ended') onEnded();
  }, SOURCE_ENDED_POLL_MS);
}

/**
 * The room's AudioContext, as LiveKit hands it to the local microphone track (and Krisp runs in).
 * `audioContext` is protected in LiveKit's types but a plain property at runtime.
 */
export function roomAudioContextOf(tracks: ReadonlyArray<{ mediaStreamTrack: MediaStreamTrack }>): AudioContext | null {
  const audioTrack = tracks.find(track => track.mediaStreamTrack.kind === 'audio') as
    { audioContext?: AudioContext } | undefined;
  return audioTrack?.audioContext ?? null;
}
