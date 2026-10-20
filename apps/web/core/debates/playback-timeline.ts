import type { BreakCut } from './playback-breaks';

/** A viewer-facing timeline that excludes the silent intervals skipped by automatic edits. */
export function playbackTimeline(cuts: readonly BreakCut[], sourceDurationMs: number) {
  const sourceDuration = Math.max(0, sourceDurationMs);
  const boundSource = (ms: number) => Math.max(0, Math.min(sourceDuration, ms));
  // Clip and merge so a partial/overlapping metadata interval cannot subtract time twice.
  const removed: BreakCut[] = [];
  for (const cut of cuts
    .map(cut => ({ atMs: boundSource(cut.atMs), toMs: boundSource(cut.toMs) }))
    .filter(cut => cut.toMs > cut.atMs)
    .sort((a, b) => a.atMs - b.atMs)) {
    const last = removed[removed.length - 1];
    if (last && cut.atMs <= last.toMs) last.toMs = Math.max(last.toMs, cut.toMs);
    else removed.push(cut);
  }
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
