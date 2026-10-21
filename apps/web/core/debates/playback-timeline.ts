export type BreakCut = {
  /** When to cut: midway through a round title's hold, or at an early end's quiet. */
  atMs: number;
  /** Where to: the silent tail before the next turn, or the end after the final End. */
  toMs: number;
};

/** Normalize source cuts once for both automatic seeks and the viewer-facing scrubber. */
export function mergeBreakCuts(cuts: readonly BreakCut[]): BreakCut[] {
  const merged: BreakCut[] = [];
  for (const cut of cuts.filter(cut => cut.toMs > cut.atMs).sort((a, b) => a.atMs - b.atMs)) {
    const previous = merged.at(-1);
    if (previous && cut.atMs <= previous.toMs) previous.toMs = Math.max(previous.toMs, cut.toMs);
    else merged.push({ ...cut });
  }
  return merged;
}

/** A viewer-facing timeline that excludes the silent intervals skipped by automatic edits. */
export function playbackTimeline(cuts: readonly BreakCut[], sourceDurationMs: number) {
  const sourceDuration = Math.max(0, sourceDurationMs);
  const boundSource = (ms: number) => Math.max(0, Math.min(sourceDuration, ms));
  // Clip before merging so out-of-range metadata cannot subtract time twice.
  const removed = mergeBreakCuts(cuts.map(cut => ({ atMs: boundSource(cut.atMs), toMs: boundSource(cut.toMs) })));
  const durationMs = sourceDuration - removed.reduce((sum, cut) => sum + cut.toMs - cut.atMs, 0);
  return {
    durationMs,
    /** Both sides of a cut share one position, so the progress bar never jumps over omitted time. */
    toPlaybackMs(sourceMs: number) {
      const bounded = boundSource(sourceMs);
      return removed.reduce((ms, cut) => ms - Math.max(0, Math.min(bounded - cut.atMs, cut.toMs - cut.atMs)), bounded);
    },
    /** A scrub at an edit lands on its incoming frame, never in the omitted silence. */
    toSourceMs(playbackMs: number) {
      let sourceMs = Math.max(0, Math.min(durationMs, playbackMs));
      for (const cut of removed) {
        if (sourceMs < cut.atMs) break;
        sourceMs += cut.toMs - cut.atMs;
      }
      return sourceMs;
    },
  };
}

export type PlaybackTimeline = ReturnType<typeof playbackTimeline>;
