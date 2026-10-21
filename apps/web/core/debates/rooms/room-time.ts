const MINUTE_MS = 60_000;

/**
 * Where a debate's start is from now, in whole minutes. Ahead of the start it rounds up, so the last
 * minute reads "in 1" rather than "in 0"; the first minute after it is `now` rather than "0 ago".
 * `null` for an unparseable start, which has nothing honest to say.
 *
 * The join prompt's "Scheduled in 3 mins" and the Running late dialog's "started 3 minutes ago" both
 * read this, so the two cannot disagree about the same moment.
 */
export function startOffset(untilStartMs: number): { in: number } | { ago: number } | 'now' | null {
  if (!Number.isFinite(untilStartMs)) return null;
  if (untilStartMs > 0) return { in: Math.ceil(untilStartMs / MINUTE_MS) };
  const ago = Math.floor(-untilStartMs / MINUTE_MS);
  return ago < 1 ? 'now' : { ago };
}

/** `1:13 PM`, in the viewer's zone. An unparseable time comes back as written rather than blank. */
export function formatClockTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
