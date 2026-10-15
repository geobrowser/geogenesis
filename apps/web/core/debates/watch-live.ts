/**
 * Whether claim surfaces offer "Watch live" on a running debate.
 *
 * Off until live watching exists (GEO-3334, GEO-3138). Until then there is nowhere live to send
 * the reader: the flag-only shape opened the space's feed, which plays an older recording, and a
 * running debate's room has no recording yet. A pill that promises the debate happening now and
 * then shows a different one is worse than no pill, so the slot falls through to its spacer.
 */
export const WATCH_LIVE_ENABLED = false;
