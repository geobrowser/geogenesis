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

const NONCE_RETRY_ATTEMPTS = 3;
const NONCE_RETRY_DELAY_MS = 500;

const isInvalidAccountNonceError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const walk = (error as { walk?: (fn: (e: unknown) => boolean) => unknown }).walk;
  if (typeof walk === 'function') {
    return Boolean(walk.call(error, e => (e as Error)?.name === 'InvalidAccountNonceError'));
  }
  return error.name === 'InvalidAccountNonceError';
};

/**
 * AA25 ("Invalid Smart Account nonce used for User Operation") is a bundler
 * validation-phase rejection thrown from eth_sendUserOperation before any hash is
 * returned — by the ERC-4337 spec, nothing was accepted into the mempool. Retrying is
 * safe for the same reason QueuedSendTimeoutError is safe to retry: never submitted.
 * A short retry absorbs the case where the account's on-chain nonce read (via a
 * separate RPC client from the bundler) lags just behind a just-confirmed prior send
 * on the same key — the next read picks up the advanced nonce.
 */
export const withNonceRetry = async <T>(task: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < NONCE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isInvalidAccountNonceError(error)) throw error;
      if (attempt < NONCE_RETRY_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, NONCE_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
};

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
