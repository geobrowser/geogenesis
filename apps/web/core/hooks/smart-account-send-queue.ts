/**
 * Per-EOA send serialization. The kernel client computes the nonce at submit time, so
 * two overlapping sends compute the same nonce and the bundler rejects the second
 * (AA25). The queue must live at module scope: react-query rebuilds the wrapped smart
 * account on any refetch (window focus, the walletAddress cookie useSmartAccount
 * itself writes), and a queue captured inside its queryFn resets to empty while
 * closures from earlier renders still hold the previous instance — two instances, two
 * queues, one nonce space.
 */
const sendChainByAddress = new Map<string, Promise<unknown>>();

/**
 * Thrown when a send waited so long behind earlier sends that we abandon it before it
 * starts. Nothing was submitted, so retrying cannot duplicate an on-chain op.
 */
export class QueuedSendTimeoutError extends Error {
  constructor(waitedMs: number) {
    super(
      `Transaction timed out after ${Math.round(waitedMs / 1000)}s waiting for an earlier ` +
        'transaction to confirm. Nothing was submitted — it is safe to retry.'
    );
    this.name = 'QueuedSendTimeoutError';
  }
}

/**
 * Longest a send may sit queued before it is abandoned (pre-submission, so abandoning
 * is safe). This guarantees the invariant useSmartAccountTransaction's timeout relies
 * on: a send that errors while queued NEVER submits later, so a user retry after a
 * timeout cannot double-submit.
 *
 * Sized to EXCEED the longest a slot can be held. A sendUserOperation holds its slot
 * through receipt confirmation (RECEIPT_DEADLINE_MS = 90s in useSmartAccount), so the
 * earlier 45s bound guaranteed the opposite of what it intended: a vote queued behind
 * a publish was rejected as "timed out" at 45s having never been submitted, every time
 * inclusion was slow. Any change to RECEIPT_DEADLINE_MS must move this too, and
 * useSmartAccountTransaction's outer timeout must stay above both combined.
 */
export const MAX_QUEUE_WAIT_MS = 120_000;

export const enqueueFor = <T>(
  address: string,
  task: () => Promise<T>,
  { maxQueueWaitMs }: { maxQueueWaitMs?: number } = {}
): Promise<T> => {
  const enqueuedAt = Date.now();
  const guarded = () => {
    const waited = Date.now() - enqueuedAt;
    if (maxQueueWaitMs !== undefined && waited > maxQueueWaitMs) {
      return Promise.reject(new QueuedSendTimeoutError(waited));
    }
    return task();
  };
  const prev = sendChainByAddress.get(address) ?? Promise.resolve();
  // A failed send must not block the next one, so the stored continuation swallows
  // the error (the caller still sees it via the returned promise).
  const run = prev.then(guarded, guarded);
  sendChainByAddress.set(
    address,
    run.catch(() => undefined)
  );
  return run;
};
