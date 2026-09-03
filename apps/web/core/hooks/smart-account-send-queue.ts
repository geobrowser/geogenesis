import { reportError } from '~/core/telemetry/logger';

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

/**
 * Backoff rather than a flat delay, because the thing being waited on is a block, not a
 * fixed lag. This chain only produces blocks when something happens — that is what
 * gaia's `chain-keepalive` CronJob exists for, nudging it after 10 minutes idle — so the
 * gap between a confirmed send and the next block that advances the nonce read is
 * unbounded in principle and frequently seconds rather than milliseconds. The previous
 * 3 x 500ms could not span even one slow block.
 *
 * Total worst case ~7.5s of waiting. That is deliberately bounded: a send holds its queue
 * slot for this plus the receipt wait (RECEIPT_DEADLINE_MS = 90s), and the sum must stay
 * under MAX_QUEUE_WAIT_MS or a queued send behind it is failed as timed-out having never
 * been submitted. 7.5 + 90 < 120 holds. Raising either value means re-checking that sum.
 */
const SUBMISSION_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000] as const;

const RETRYABLE_SUBMISSION_ERROR_NAMES = new Set([
  // AA25 — the account nonce read (via a plain RPC) lagged the bundler's view.
  'InvalidAccountNonceError',
  // AA13/AA23 — EntryPoint rejected the op during simulateValidation. Same cause in
  // practice on this chain (stale account state at validation time), and reported by two
  // users on 2026-09-03 as a raw dialog because nothing retried it. See GEO-2810.
  'UserOperationRejectedByEntryPointError',
]);

/**
 * Validation-phase rejections from `eth_sendUserOperation`.
 *
 * Every name here MUST be one the bundler can only throw *before* returning a hash. That
 * is the whole basis for retrying: by the ERC-4337 spec nothing entered the mempool, so a
 * second attempt cannot duplicate an on-chain op. Adding a name that can also surface
 * after submission would turn this into the duplicate-publish bug described in
 * `useSmartAccount` — check that property before extending the set.
 */
const isRetryableSubmissionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const matches = (e: unknown) => RETRYABLE_SUBMISSION_ERROR_NAMES.has((e as Error)?.name);
  const walk = (error as { walk?: (fn: (e: unknown) => boolean) => unknown }).walk;
  if (typeof walk === 'function') {
    return Boolean(walk.call(error, matches));
  }
  return matches(error);
};

/**
 * Retry a bundler *submission* that was rejected during validation.
 *
 * A rejection at this phase (AA25, or an EntryPoint `simulateValidation` refusal) comes
 * from eth_sendUserOperation before any hash is returned — by the ERC-4337 spec nothing
 * was accepted into the mempool. Retrying is safe for the same reason
 * QueuedSendTimeoutError is safe to retry: never submitted. The retry absorbs the case
 * where the account's on-chain state, read via a separate RPC client from the bundler,
 * lags behind a just-confirmed prior send on the same key.
 *
 * **Pass only the submission.** The caller must not include receipt confirmation in
 * `task`: a confirm-phase failure re-entering this loop would re-send an op that is
 * already landing. Today's error names cannot come from the confirm phase, so that would
 * be latent rather than immediate — which is exactly the kind of bug that surfaces months
 * later as a duplicate publish. The narrow scope is the guard, not the predicate.
 *
 * Exhaustion is reported: before this, the only signal these were happening at all was a
 * user pasting a screenshot (GEO-2810).
 */
export const withSubmissionRetry = async <T>(task: () => Promise<T>): Promise<T> => {
  const attempts = SUBMISSION_RETRY_DELAYS_MS.length + 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableSubmissionError(error)) throw error;
      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, SUBMISSION_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  reportError(lastError, {
    tags: { area: 'smart-account', phase: 'submission', outcome: 'retries-exhausted' },
    contexts: { retry: { attempts, totalDelayMs: SUBMISSION_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) } },
  });
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
