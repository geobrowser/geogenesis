import { type GeoWalletClient, RevertedUserOperationError } from '@geogenesis/auth/account';

import { reportError } from '~/core/telemetry/logger';

import { withSubmissionRetry } from './smart-account-send-queue';

type TransactionArgs = Parameters<GeoWalletClient['sendTransaction']>[0];

/**
 * The kernel's `sendTransaction`, unrolled so the caller hears about the submission before the
 * inclusion (GEO-2889).
 *
 * Kernel `sendTransaction` is `sendUserOperation` with one call, then `waitForUserOperationReceipt`,
 * and it only resolves after the second. That wait is the whole of the latency a position write
 * shows — p50 6s, p90 ~30s, p99 ~2 minutes (`web.write.sendTransaction`) — while the bundler has
 * accepted the op within a second or two. `onSubmitted` fires at that acceptance, so the UI can
 * treat the write as made and still learn the outcome from the returned promise.
 *
 * Deliberately the same shape as the kernel's, so a caller opting in changes what it can observe
 * and nothing about how the op is sent:
 *
 * - The same single-call op, through the same `sendUserOperation` every publish already uses.
 * - The same receipt wait, with viem's default timeout — not `confirmInclusion`'s 90s, which would
 *   report the slow tail (the ~1% past 90s) as failed for ops that went on to land.
 * - Only the submission is retried, which is what the queue's retry predicate already assumes.
 * - Run inside the caller's queue slot, so the slot is still held through inclusion and the nonce
 *   argument in `useSmartAccount` is untouched.
 *
 * One deliberate difference: a receipt that says the op reverted throws, where the kernel returns
 * its transaction hash as if it had worked. The caller has already told the user this write was
 * made, so a revert has to come back as the failure it is or the position stays shown as held.
 *
 * Resolves with the user-operation hash rather than the bundle's transaction hash.
 */
export async function sendTransactionReportingSubmission(
  client: Pick<GeoWalletClient, 'sendUserOperation' | 'waitForUserOperationReceipt'>,
  { to, data, value }: TransactionArgs,
  onSubmitted: (userOperationHash: `0x${string}`) => void
): Promise<`0x${string}`> {
  const hash = await withSubmissionRetry(() =>
    client.sendUserOperation({ calls: [{ to, data: data || '0x', value: value ?? 0n }] })
  );

  // A throwing listener must not turn a submitted op into a reported failure — the caller would
  // roll back, and retrying could then publish twice.
  try {
    onSubmitted(hash);
  } catch (error) {
    reportError(error, { tags: { area: 'smart-account', phase: 'submission', outcome: 'on-submitted-threw' } });
  }

  const receipt = await client.waitForUserOperationReceipt({ hash });
  if (!receipt.success) throw new RevertedUserOperationError(hash);
  return hash;
}
