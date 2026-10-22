/**
 * The ledger half of a payout. curator-backend keeps the curator points ledger
 * (a space's balance, a curator's rewards) outside the graph; publishing a
 * Payout relation alone moves no points. After the relation lands, an editor's
 * call to `POST /space/:spaceId/payout` debits the space and credits the
 * recipient. The backend is idempotent on `payoutEntityId` (a ProcessedPayout
 * row), so retrying a credit never pays twice.
 *
 * Mirrors curator-app's `recordPayoutCredit` (utils/manual-payout.ts),
 * including passing the outer Payout Recipient relation id as `payoutEntityId`.
 */
import { uuidToHex } from '~/core/id/normalize';

import { CURATOR_API_URL } from './config';

const CREDIT_RETRY_DELAYS_MS = [0, 750, 1500, 3000] as const;

export class PayoutCreditError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = 'PayoutCreditError';
  }
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

  for (const delay of CREDIT_RETRY_DELAYS_MS) {
    if (delay > 0) await wait(delay);
    try {
      // The backend reads the new Payout from the graph, which can lag the
      // publish by a moment — hence retrying 5xx briefly.
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
      if (!response.ok) throw new PayoutCreditError(await messageFrom(response), response.status);
      const body = (await response.json()) as { newBalance?: unknown };
      return { newBalance: Number(body.newBalance ?? 0) };
    } catch (error) {
      lastError = error;
      if (!isRetryableCreditError(error)) break;
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
