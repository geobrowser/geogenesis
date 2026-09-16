type PlaybackSample = {
  now: number;
  mediaMs: number;
  durationMs: number;
  eligible: boolean;
  muted: boolean;
  trigger: 'manual' | 'autoplay';
};

/** Raw evidence only. Qualification and unique-media union belong to the versioned backend. */
export function createPlaybackMeasurement(emit: (properties: Record<string, unknown>) => void) {
  const epochOrigin = performance.timeOrigin;
  let previous: PlaybackSample | null = null;
  let chunk: {
    start: number;
    end: number;
    started: number;
    ended: number;
    active: number;
    sample: PlaybackSample;
  } | null = null;
  let sequence = 0;
  const flush = () => {
    const pending = chunk;
    chunk = null;
    if (!pending || pending.end <= pending.start || pending.active < 1) return;
    try {
      emit({
        interval_sequence: ++sequence,
        media_start_ms: pending.start,
        media_end_ms: pending.end,
        interval_start_ms: Math.floor(epochOrigin + pending.started),
        interval_end_ms: Math.floor(epochOrigin + pending.ended),
        active_ms: Math.floor(pending.active),
        media_duration_ms: pending.sample.durationMs,
        duration_state: pending.sample.durationMs > 0 ? 'known' : 'unknown',
        muted: pending.sample.muted,
        trigger: pending.sample.trigger,
        foreground: true,
        visibility_rule: 'player-60pct-v1',
      });
    } catch {
      /* Telemetry cannot interrupt playback. */
    }
  };
  const interrupt = () => {
    flush();
    previous = null;
  };
  return {
    flush,
    break: interrupt,
    sample(current: PlaybackSample) {
      if (
        !current.eligible ||
        !Number.isFinite(current.now) ||
        !Number.isFinite(current.mediaMs) ||
        current.mediaMs < 0
      ) {
        interrupt();
        return;
      }
      const prior = previous;
      previous = current;
      if (!prior) return;
      const elapsed = current.now - prior.now;
      const advance = current.mediaMs - prior.mediaMs;
      // Sparse callbacks, seek jumps and frozen decoders are not observed viewing.
      // The primary player runs at 1x; secondary synchronization nudges are irrelevant.
      if (
        elapsed <= 0 ||
        elapsed > 2000 ||
        advance <= 0 ||
        advance > elapsed * 1.25 + 100 ||
        prior.muted !== current.muted ||
        prior.trigger !== current.trigger ||
        prior.durationMs !== current.durationMs
      ) {
        flush();
        return;
      }
      const start = Math.floor(prior.mediaMs);
      const end = Math.floor(current.mediaMs);
      if (end <= start) return;
      if (!chunk) chunk = { start, end, started: prior.now, ended: current.now, active: 0, sample: current };
      chunk.end = end;
      chunk.ended = current.now;
      chunk.active += Math.min(elapsed, advance);
      if (chunk.active >= 10_000) flush();
    },
  };
}
