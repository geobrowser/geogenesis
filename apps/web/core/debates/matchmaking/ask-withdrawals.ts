/**
 * Requests and challenges the viewer took back themselves (GEO-3463). Taking one back is not "nobody
 * took it", so the panel's ended state skips them.
 *
 * Recorded by the withdraw and reject mutations themselves rather than by the strip's Cancel, because
 * an ask can be taken back from anywhere — full screen's sent-request card, a lobby — and every one of
 * those has to count. A module of its own, with no imports, so the hooks that write it and the hook
 * that reads it can both depend on it without depending on each other.
 */
const withdrawnAt = new Map<string, number>();

/**
 * How long a mark is believed. Long enough to outlast the refetch that drops the ask, short enough
 * that the map never grows: an ask lives for minutes, and nothing asks about one after it has gone.
 */
export const ASK_WITHDRAWN_TTL_MS = 2 * 60_000;

/** Marked when the press goes out, not when it lands: a poll can drop the ask before the response. */
export function markAskWithdrawn(id: string) {
  withdrawnAt.set(id, Date.now());
}

/** The withdraw failed, so the ask is still out and may yet end unanswered. */
export function unmarkAskWithdrawn(id: string) {
  withdrawnAt.delete(id);
}

/**
 * Whether `id` was taken back by the viewer. Read without forgetting: the panel and full screen each
 * mount a `HubAskProvider`, and the first to ask must not leave the second reading "nobody took it".
 */
export function askWasWithdrawn(id: string) {
  const now = Date.now();
  for (const [key, at] of withdrawnAt) {
    if (now - at > ASK_WITHDRAWN_TTL_MS) withdrawnAt.delete(key);
  }
  return withdrawnAt.has(id);
}
