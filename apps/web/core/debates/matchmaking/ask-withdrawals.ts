/**
 * Requests and challenges the viewer took back themselves (GEO-3463). Taking one back is not "nobody
 * took it", so the panel's ended state skips them.
 *
 * Recorded by the withdraw and reject mutations themselves rather than by the strip's Cancel, because
 * an ask can be taken back from anywhere — full screen's sent-request card, a lobby — and every one of
 * those has to count. A module of its own, with no imports, so the hooks that write it and the hook
 * that reads it can both depend on it without depending on each other.
 */
const withdrawn = new Set<string>();

export function markAskWithdrawn(id: string) {
  withdrawn.add(id);
}

/** Whether `id` was taken back by the viewer. Forgets it as it answers, so the set stays small. */
export function consumeAskWithdrawn(id: string) {
  return withdrawn.delete(id);
}
