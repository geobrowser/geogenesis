import { submittedUserOperationHash } from '@geogenesis/auth/account';

import { reportError, reportEvent } from '~/core/telemetry/logger';

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

/** Sends enqueued and not yet settled, per address. Reported as queue depth. */
const pendingCountByAddress = new Map<string, number>();

/** Last slow-start warning per address, for throttling. */
const lastWaitWarningAtByAddress = new Map<string, number>();
const WAIT_WARNING_THROTTLE_MS = 60_000;

/**
 * Thrown when a send waited so long behind earlier sends that we abandon it before it
 * starts. Nothing was submitted, so retrying cannot duplicate an on-chain op.
 */
export class QueuedSendTimeoutError extends Error {
  /**
   * @param waitedMs time from enqueue to the turn arriving
   * @param queueDepth sends already queued ahead of this one when it was enqueued
   */
  constructor(
    readonly waitedMs: number,
    readonly queueDepth: number
  ) {
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
 *
 * Accepted as a fixed bound (GEO-3037): a timeout is reported to Sentry, warned about at
 * half the budget, and offered to the user as a retry. Changing the queue shape for rapid
 * voting is tracked separately.
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

/**
 * Walks a viem error chain (`.walk` when it has one, `cause` otherwise), the same way
 * isRetryableSubmissionError does, testing every link.
 */
const someInChain = (error: unknown, test: (e: unknown) => boolean): boolean => {
  const walk = (error as { walk?: (fn: (e: unknown) => boolean) => unknown } | null)?.walk;
  if (typeof walk === 'function') return Boolean(walk.call(error, test));
  for (let current = error, depth = 0; current != null && depth < 10; depth++) {
    if (test(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/**
 * The bundler's "Already known": the op being submitted is one it already holds (ZeroDev returns
 * it as JSON-RPC -32602, which viem surfaces as `InvalidFieldsError` — "Invalid fields set on
 * User Operation" — with the bundler's text as `details`).
 *
 * Matched on the text because that is all the bundler gives us: -32602 alone also covers genuinely
 * malformed ops. Every place the text can sit is checked (`details` on the RPC error, the message
 * of each wrapper), so the match does not depend on how many layers wrap it.
 */
const ALREADY_KNOWN_PATTERN = /\balready known\b/i;

export const isAlreadyKnownSubmissionError = (error: unknown): boolean =>
  someInChain(error, e => {
    if (!(e instanceof Error)) return false;
    const { details, shortMessage } = e as { details?: unknown; shortMessage?: unknown };
    return [e.message, details, shortMessage].some(
      text => typeof text === 'string' && ALREADY_KNOWN_PATTERN.test(text)
    );
  });

/**
 * Treat "already known" from `eth_sendUserOperation` as the submission it is.
 *
 * Every write here sits under a caller retry (`Effect.retry`, ~10s windows) that re-runs the
 * whole send after ANY failure — including a receipt wait that timed out on an op the bundler had
 * already accepted. The re-run prepares the same op against the same still-pending nonce, and the
 * bundler rejects it as "already known". That rejection used to be fatal, so a publish that was
 * about to land was reported as failed and everything after it (the FAST proposal's vote and
 * execute) never ran (2026-09-30: proposal 4d9c4c5d… created, left at zero votes).
 *
 * The bundler holding the op is exactly the success case, so this returns the op's hash —
 * computed locally for the exact op sent, see `submittedUserOperationHash` — and the caller goes on
 * to wait for its receipt as if the send had just succeeded. That wait is what keeps this honest:
 * a hash that never lands still fails, at the receipt deadline, as ReceiptConfirmationTimeoutError.
 *
 * An "already known" error without a hash (a sender that does not attach one) is rethrown
 * unchanged, as is every other error: a real rejection still surfaces.
 */
export const recoverAlreadyKnownSubmission = async (task: () => Promise<`0x${string}`>): Promise<`0x${string}`> => {
  try {
    return await task();
  } catch (error) {
    if (!isAlreadyKnownSubmissionError(error)) throw error;
    const hash = submittedUserOperationHash(error);
    if (!hash) {
      reportError(error, {
        tags: { area: 'smart-account', phase: 'submission', outcome: 'already-known-without-hash' },
      });
      throw error;
    }
    reportEvent({
      name: 'smart-account.submission-already-known',
      level: 'warning',
      tags: { area: 'smart-account', phase: 'submission', outcome: 'already-known-recovered' },
      extra: { userOpHash: hash },
    });
    return hash;
  }
};

type Call = { to: `0x${string}`; data: `0x${string}`; value?: bigint };

/**
 * How long a submitted-but-unconfirmed op is remembered for resumption. Well past any caller
 * retry window; short enough that a later, deliberate send of the same calls is not mistaken for
 * a retry of an old one.
 */
const UNCONFIRMED_RESUME_TTL_MS = 10 * 60_000;

/** Per address: the last op whose receipt wait timed out, and the calls it carried. */
const unconfirmedByAddress = new Map<string, { callsKey: string; hash: `0x${string}`; at: number }>();

const callsKeyOf = (calls: ReadonlyArray<Call>) =>
  calls.map(call => `${call.to.toLowerCase()}:${(call.value ?? 0n).toString()}:${call.data.toLowerCase()}`).join('|');

const isReceiptConfirmationTimeout = (error: unknown) =>
  (error as Error | null)?.name === 'ReceiptConfirmationTimeoutError';

/**
 * Submit, then confirm — but if the previous send of these exact calls from this address was
 * submitted and only its receipt wait timed out, resume waiting on that op instead of submitting
 * again.
 *
 * The caller retry after a receipt timeout is not hypothetical: Effect's `Schedule.elapsed` starts
 * at the first failure, not at the first attempt, so a 90s receipt timeout is always followed by a
 * re-run. Re-submitting then is either rejected ("already known", handled by
 * recoverAlreadyKnownSubmission) or, if the op landed while the receipt read lagged, a DUPLICATE
 * on the next nonce. Resuming the wait avoids both.
 *
 * Resumes once: if the resumed wait times out too, the record is dropped and the next call
 * submits afresh, so an op the bundler really did drop cannot wedge the user.
 */
export const submitOrResumeUserOperation = async (
  address: string,
  calls: ReadonlyArray<Call>,
  submit: () => Promise<`0x${string}`>,
  confirm: (hash: `0x${string}`) => Promise<void>
): Promise<`0x${string}`> => {
  const callsKey = callsKeyOf(calls);
  const previous = unconfirmedByAddress.get(address);
  const expired = previous !== undefined && Date.now() - previous.at >= UNCONFIRMED_RESUME_TTL_MS;

  const resumable = previous !== undefined && !expired && previous.callsKey === callsKey;

  // Only this resumption, or expiry, consumes the record. A send of DIFFERENT calls must not: while
  // the unconfirmed op is still pending it shares that op's nonce and is rejected (AA25), and if it
  // cleared the record the caller's retry of the original calls would resubmit instead of resuming.
  if (resumable || expired) unconfirmedByAddress.delete(address);

  let hash: `0x${string}`;
  if (resumable) {
    hash = previous.hash;
    reportEvent({
      name: 'smart-account.receipt-wait-resumed',
      level: 'warning',
      tags: { area: 'smart-account', phase: 'confirmation', outcome: 'resumed' },
      extra: { userOpHash: hash },
    });
  } else {
    hash = await submit();
  }

  try {
    await confirm(hash);
  } catch (error) {
    if (!resumable && isReceiptConfirmationTimeout(error)) {
      unconfirmedByAddress.set(address, { callsKey, hash, at: Date.now() });
    }
    throw error;
  }
  return hash;
};

/** Resolves once every send queued at call time has settled. Never rejects. */
export const waitForQueuedSends = (): Promise<void> => Promise.all(sendChainByAddress.values()).then(() => undefined);

export const enqueueFor = <T>(
  address: string,
  task: () => Promise<T>,
  { maxQueueWaitMs }: { maxQueueWaitMs?: number } = {}
): Promise<T> => {
  const enqueuedAt = Date.now();
  const queueDepth = pendingCountByAddress.get(address) ?? 0;
  pendingCountByAddress.set(address, queueDepth + 1);

  const guarded = () => {
    const waited = Date.now() - enqueuedAt;
    if (maxQueueWaitMs !== undefined && waited > maxQueueWaitMs) {
      const error = new QueuedSendTimeoutError(waited, queueDepth);
      // Reported here rather than by callers so every bounded send is covered. A burst
      // reports once per abandoned send; the waitedMs spread shows the cascade.
      reportError(error, {
        tags: { area: 'smart-account', phase: 'queue', outcome: 'queue-timeout' },
        contexts: { queue: { waitedMs: waited, queueDepth, maxQueueWaitMs } },
      });
      return Promise.reject(error);
    }
    if (maxQueueWaitMs !== undefined && waited > maxQueueWaitMs / 2) {
      warnSlowQueueStart(address, waited, queueDepth, maxQueueWaitMs);
    }
    return task();
  };
  const prev = sendChainByAddress.get(address) ?? Promise.resolve();
  // A failed send must not block the next one, so the stored continuation swallows
  // the error (the caller still sees it via the returned promise).
  const run = prev.then(guarded, guarded).finally(() => {
    const remaining = (pendingCountByAddress.get(address) ?? 1) - 1;
    if (remaining > 0) pendingCountByAddress.set(address, remaining);
    else pendingCountByAddress.delete(address);
  });
  sendChainByAddress.set(
    address,
    run.catch(() => undefined)
  );
  return run;
};

/** Leading indicator: a send started, but past half its budget. The next one may not. */
const warnSlowQueueStart = (address: string, waitedMs: number, queueDepth: number, maxQueueWaitMs: number) => {
  const now = Date.now();
  const lastWarnedAt = lastWaitWarningAtByAddress.get(address);
  if (lastWarnedAt !== undefined && now - lastWarnedAt < WAIT_WARNING_THROTTLE_MS) return;
  lastWaitWarningAtByAddress.set(address, now);
  reportEvent({
    name: 'smart-account.queue-wait-high',
    level: 'warning',
    tags: { area: 'smart-account', phase: 'queue', outcome: 'queue-wait-high' },
    extra: { waitedMs, queueDepth, maxQueueWaitMs },
  });
};

/** Test-only: pending sends per address. */
export const queueDepthFor = (address: string): number => pendingCountByAddress.get(address) ?? 0;
