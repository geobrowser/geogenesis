/**
 * A payout that has started but not finished, kept across reloads. Neither half
 * can be found again from the other side — curator-backend has no "payouts
 * missing from the graph" read, and the graph has no record of a credit — so
 * if the tab closes mid-payout this is the only record of what is left to do.
 * Finishing is safe to repeat: the ledger is idempotent on the payout id, and
 * the publish reuses the same ids.
 *
 * Storage can be missing, full or blocked (private windows, previews); then the
 * pending payout lives only as long as the tab.
 */
import type { PendingPayout } from './use-direct-payout';

export function pendingPayoutStorageKey(bountyId: string): string {
  return `geogenesis.bounty-pending-payout.v1:${bountyId}`;
}

function isPendingPayout(value: unknown): value is PendingPayout {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const recipient = v.recipient as Record<string, unknown> | null | undefined;
  return (
    (v.stage === 'credit' || v.stage === 'publish') &&
    typeof v.payoutRelationId === 'string' &&
    typeof v.amount === 'number' &&
    v.amount > 0 &&
    !!recipient &&
    typeof recipient.spaceId === 'string' &&
    (recipient.name === null || typeof recipient.name === 'string') &&
    Array.isArray(v.values) &&
    Array.isArray(v.relations)
  );
}

export function loadPendingPayout(bountyId: string): PendingPayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pendingPayoutStorageKey(bountyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPendingPayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingPayout(bountyId: string, pending: PendingPayout | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = pendingPayoutStorageKey(bountyId);
    if (pending) window.localStorage.setItem(key, JSON.stringify(pending));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; the pending payout stays in memory for this tab.
  }
}
