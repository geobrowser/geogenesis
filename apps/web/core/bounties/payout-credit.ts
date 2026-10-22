/**
 * The ledger half of a payout. curator-backend keeps the curator points ledger
 * (a space's balance, a curator's rewards) outside the graph; publishing a
 * Payout relation alone moves no points. An editor's call to
 * `POST /space/:spaceId/payout` checks the balance, debits the space and
 * credits the recipient in one statement, and is idempotent on
 * `payoutEntityId` (a uniquely-constrained ProcessedPayout row), so retrying a
 * payout never pays it twice. It never reads the Payout from the graph, so it
 * can run before the publish.
 *
 * KNOWN LIMITATION (curator-backend): the balance check is not safe against
 * two DIFFERENT payouts from one space at the same moment. The statement reads
 * `s.balance` before it holds a write lock and writes `currentBalance - amount`
 * back, so both can pass the check and one debit overwrites the other (a lost
 * update; the space keeps points it paid out). Fixing it means taking the lock
 * first (write to `s` before reading the balance) in `recordPayout`. Nothing
 * here can prevent it, so don't rely on the ledger to serialise payouts.
 *
 * Same endpoint and payload as curator-app's `recordPayoutCredit`
 * (utils/manual-payout.ts), including the outer Payout Recipient relation id
 * as `payoutEntityId`.
 */
import { uuidToHex } from '~/core/id/normalize';

import { CURATOR_API_URL } from './config';

const CREDIT_RETRY_DELAYS_MS = [0, 750, 1500, 3000] as const;

/**
 * 400s the ledger returns only when it moved no points for this payout id, ever.
 * Its statement is `WHERE alreadyProcessed OR balance >= amount`, so a payout
 * that had already gone through would have come back as a success instead; and
 * the amount check runs on the same amount every attempt. Any other 400 may be
 * a database error (curator-backend maps those to 400 too), so it proves nothing.
 */
const DEFINITE_REFUSALS = [/^Insufficient balance/i, /^Payout amount must be/i];

export class PayoutCreditError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /**
     * How sure we are that no points moved: `always` — a definite refusal, true
     * whatever happened on earlier attempts; `this-call` — a 4xx before the
     * ledger (auth, editor check) on a call with no ambiguous attempt, which only
     * proves it if no earlier call was ambiguous either; `unknown` otherwise.
     */
    readonly noPointsMoved: 'always' | 'this-call' | 'unknown' = 'unknown'
  ) {
    super(message);
    this.name = 'PayoutCreditError';
  }
}

/**
 * Whether the ledger certainly moved no points for this payout. `firstAttempt`:
 * no earlier call for this payout id could have gone through.
 */
export function ledgerMovedNoPoints(error: unknown, firstAttempt: boolean): boolean {
  if (!(error instanceof PayoutCreditError)) return false;
  return error.noPointsMoved === 'always' || (firstAttempt && error.noPointsMoved === 'this-call');
}

/** Network failures and 5xx are worth retrying; a 4xx (not an editor, bad amount, low balance) is not. */
export function isRetryableCreditError(error: unknown): boolean {
  return !(error instanceof PayoutCreditError) || error.status === null || error.status >= 500;
}

async function messageFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // Non-JSON error body; fall through to the status line.
  }
  return `The points ledger rejected the payout (${response.status}).`;
}

export type PayoutCreditInput = {
  /** The bounty's DAO space — the space whose balance pays. */
  spaceId: string;
  bountyId: string;
  /** The published Payout Recipient relation id. */
  payoutEntityId: string;
  /** The recipient as the graph records it — the curator's personal space id. */
  recipientEntityId: string;
  amount: number;
  identityToken: string;
};

export async function recordPayoutCredit(
  input: PayoutCreditInput,
  options: { fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void> } = {}
): Promise<{ newBalance: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let lastError: unknown = null;
  // Set once an attempt fails without a clear answer: it may have been applied.
  let outcomeUnknown = false;

  for (const delay of CREDIT_RETRY_DELAYS_MS) {
    if (delay > 0) await wait(delay);
    try {
      // Transient failures are retried briefly; idempotency makes that safe.
      const response = await fetchImpl(`${CURATOR_API_URL}/space/${uuidToHex(input.spaceId)}/payout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${input.identityToken}` },
        body: JSON.stringify({
          amount: Math.round(input.amount),
          bountyId: uuidToHex(input.bountyId),
          payoutEntityId: uuidToHex(input.payoutEntityId),
          recipientEntityId: uuidToHex(input.recipientEntityId),
        }),
      });
      if (!response.ok) {
        const message = await messageFrom(response);
        const definite = response.status === 400 && DEFINITE_REFUSALS.some(pattern => pattern.test(message));
        const beforeLedger = response.status < 500 && response.status !== 400 && !outcomeUnknown;
        throw new PayoutCreditError(
          message,
          response.status,
          definite ? 'always' : beforeLedger ? 'this-call' : 'unknown'
        );
      }
      const body = (await response.json()) as { newBalance?: unknown };
      return { newBalance: Number(body.newBalance ?? 0) };
    } catch (error) {
      lastError = error;
      if (!isRetryableCreditError(error)) break;
      outcomeUnknown = true;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new PayoutCreditError('Could not reach the points ledger.', null);
}

/** The space's spendable points balance, or null when the ledger can't be read. */
export async function fetchSpaceBalance(spaceId: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const response = await fetchImpl(`${CURATOR_API_URL}/space/${uuidToHex(spaceId)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { balance?: unknown };
    const balance = Number(body.balance);
    return Number.isFinite(balance) ? balance : null;
  } catch {
    return null;
  }
}
