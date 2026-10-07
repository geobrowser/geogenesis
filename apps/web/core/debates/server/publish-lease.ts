import { type AcceptorLockStore, upstashStore } from './acceptor-lock';

/**
 * How long a submitted debate publish keeps the sweep from submitting that debate again.
 *
 * The sweep's only "already published" signal is the Debate entity in the graph, so while the
 * indexer lags it sees nothing and publishes again on every tick. On 2026-10-05 the indexer stalled
 * for 83 minutes (GEO-3151) and three debates were published 11 to 16 times. Six hours outlasts any
 * lag seen so far; past it, a publish that never landed is retried, so a lost one still recovers.
 */
export const DEBATE_PUBLISH_LEASE_MS = 6 * 60 * 60 * 1000;

export function debatePublishLeaseKey(debateId: string): string {
  return `debate-acceptor:publish-submitted:${debateId.replace(/-/g, '').toLowerCase()}`;
}

export type DebatePublishLeaseOutcome<T> = { ran: true; value: T } | { ran: false };

/**
 * Run one debate's publish under a lease that outlives the run when, and only when, it submitted.
 *
 * Takes the lease (SET NX PX) before `run`. If the lease is already held, a publish of this debate
 * was submitted within {@link DEBATE_PUBLISH_LEASE_MS} and is presumably waiting on the indexer, so
 * `run` is skipped. `run` calls `markSubmitted` as soon as a user operation has been sent; if it
 * finishes or throws without having sent one (media not ready, not an editor, a failure before
 * signing), the lease is released so the next tick tries again. Once something was sent the lease
 * stays until it expires — whatever happened on chain, the graph will say so before then.
 *
 * Fails open, like the signing lock: without Upstash, or when it does not answer, `run` runs
 * unguarded. That is safe rather than merely tolerable, because the draft's ids are derived from the
 * debate (`debatePublishId`), so a republish rewrites the same entities instead of adding copies;
 * the lease only saves the duplicate proposals and pins.
 */
export async function withDebatePublishLease<T>(
  debateId: string,
  run: (markSubmitted: () => void) => Promise<T>,
  {
    ttlMs = DEBATE_PUBLISH_LEASE_MS,
    store = upstashStore(debatePublishLeaseKey(debateId)),
    now = () => new Date(),
  }: { ttlMs?: number; store?: AcceptorLockStore | null; now?: () => Date } = {}
): Promise<DebatePublishLeaseOutcome<T>> {
  let submitted = false;
  const markSubmitted = () => {
    submitted = true;
  };
  if (!store) return { ran: true, value: await run(markSubmitted) };

  // The value is the time the lease was taken, so a held key says when the publish went out.
  const token = now().toISOString();
  let acquired: boolean;
  try {
    acquired = await store.acquire(token, ttlMs);
  } catch (error) {
    console.warn('[debate-acceptor] publish lease unavailable; publishing without it', { debateId, error });
    return { ran: true, value: await run(markSubmitted) };
  }
  if (!acquired) return { ran: false };

  try {
    return { ran: true, value: await run(markSubmitted) };
  } finally {
    if (!submitted) {
      await store.release(token).catch(error => {
        console.warn('[debate-acceptor] could not release an unused publish lease', { debateId, error });
      });
    }
  }
}
