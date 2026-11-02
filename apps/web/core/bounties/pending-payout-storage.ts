/**
 * Payouts that have started but not finished, kept across reloads. Neither half
 * can be found again from the other side — curator-backend has no "payouts
 * missing from the graph" read, and the graph has no record of a credit — so
 * if the tab closes mid-payout this is the only record of what is left to do.
 * Finishing is safe to repeat: the ledger is idempotent on the payout id, and
 * the publish reuses the same ids.
 *
 * Kept per payout id, not one per bounty: two tabs can each start a payout
 * before seeing the other's, and a single slot would let the second overwrite
 * the first — losing the ops of a payout whose points may already have moved.
 *
 * Storage can be missing, full or blocked (private windows, previews); then the
 * pending payouts live only as long as the tab.
 */
import type { PendingPayout } from './use-direct-payout';

export function pendingPayoutStorageKey(bountyId: string): string {
  return `geogenesis.bounty-pending-payouts.v2:${bountyId}`;
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

function readAll(bountyId: string): Record<string, PendingPayout> {
  const raw = window.localStorage.getItem(pendingPayoutStorageKey(bountyId));
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, PendingPayout] =>
      isPendingPayout(entry[1])
    )
  );
}

function writeAll(bountyId: string, all: Record<string, PendingPayout>): void {
  const key = pendingPayoutStorageKey(bountyId);
  if (Object.keys(all).length === 0) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(all));
}

/** Every unfinished payout this browser holds for the bounty, oldest first. */
export function loadPendingPayouts(bountyId: string): PendingPayout[] {
  if (typeof window === 'undefined') return [];
  try {
    return Object.values(readAll(bountyId));
  } catch {
    return [];
  }
}

/** Adds or updates one payout, leaving any other tab's payouts in place. */
export function savePendingPayout(bountyId: string, pending: PendingPayout): void {
  if (typeof window === 'undefined') return;
  try {
    // Re-read right before writing so a payout another tab just added survives.
    // An update keeps its place, so the oldest unfinished payout is offered first.
    writeAll(bountyId, { ...readAll(bountyId), [pending.payoutRelationId]: pending });
  } catch {
    // Storage unavailable; the pending payout stays in memory for this tab.
  }
}

export function clearPendingPayout(bountyId: string, payoutRelationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const all = readAll(bountyId);
    delete all[payoutRelationId];
    writeAll(bountyId, all);
  } catch {
    // Storage unavailable; nothing persisted to clear.
  }
}
