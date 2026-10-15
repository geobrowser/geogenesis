/**
 * Debate-again sessions this tab has seen end, and when (GEO-3342).
 *
 * The picker learns a session is over from the session itself, which refreshes on its own push and
 * poll. `DebateCoordinator` routes into a picker off the viewer's activity, which refreshes on a
 * different schedule. So for a moment after the other person leaves, the picker has already sent the
 * viewer out while activity still says `browsing` — and the coordinator sent them straight back in,
 * to a picker that sent them out again. On 2026-10-15 that bounced people between the picker and
 * where they came from up to five times in a second and a half.
 *
 * Activity read before the end was seen cannot route back into that session. Activity read after it
 * still can: geo-chat reports a session as browsing again only if it really is.
 */
const endedAt = new Map<string, number>();

/** The picker saw this session end. */
export function markRematchEnded(sessionId: string, at = Date.now()) {
  endedAt.set(sessionId, at);
}

/** Whether activity fetched at `activityUpdatedAt` predates this tab seeing the session end. */
export function rematchEndedSince(sessionId: string, activityUpdatedAt: number) {
  const at = endedAt.get(sessionId);
  return at !== undefined && activityUpdatedAt <= at;
}

/** Tests only. */
export function resetEndedRematches() {
  endedAt.clear();
}
