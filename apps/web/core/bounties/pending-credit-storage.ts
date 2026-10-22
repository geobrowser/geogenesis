/**
 * A payout that is published but not yet credited, kept across reloads. The
 * Payout relation can't be found again from the ledger side (curator-backend
 * has no "unprocessed payouts" read), so if the tab closes after a failed
 * credit this is the only record that points still have to move. Retrying is
 * safe: the backend is idempotent on the payout id.
 *
 * Storage can be missing, full or blocked (private windows, previews); then the
 * pending credit lives only as long as the tab, as it did before.
 */
import type { PendingCredit } from './use-direct-payout';

export function pendingCreditStorageKey(bountyId: string): string {
  return `geogenesis.bounty-pending-credit.v1:${bountyId}`;
}

function isPendingCredit(value: unknown): value is PendingCredit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const recipient = v.recipient as Record<string, unknown> | null | undefined;
  return (
    typeof v.payoutRelationId === 'string' &&
    typeof v.amount === 'number' &&
    v.amount > 0 &&
    !!recipient &&
    typeof recipient.spaceId === 'string' &&
    (recipient.name === null || typeof recipient.name === 'string')
  );
}

export function loadPendingCredit(bountyId: string): PendingCredit | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pendingCreditStorageKey(bountyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPendingCredit(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingCredit(bountyId: string, pending: PendingCredit | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = pendingCreditStorageKey(bountyId);
    if (pending) window.localStorage.setItem(key, JSON.stringify(pending));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; the pending credit stays in memory for this tab.
  }
}
