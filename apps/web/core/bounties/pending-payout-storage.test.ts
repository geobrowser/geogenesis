import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPendingPayout,
  loadPendingPayouts,
  pendingPayoutStorageKey,
  savePendingPayout,
} from './pending-payout-storage';
import type { PendingPayout } from './use-direct-payout';

const BOUNTY = '020aefb3b2aa4156a3812e42f991f9a3';

function payout(id: string, overrides: Partial<PendingPayout> = {}): PendingPayout {
  return {
    stage: 'credit',
    payoutRelationId: id,
    recipient: { spaceId: 'b30570f0d43db28e6582e57eb9d5267c', name: 'Ibrahim Hassan' },
    amount: 250,
    values: [],
    relations: [],
    ...overrides,
  };
}

beforeEach(() => window.localStorage.clear());

describe('pending payout storage', () => {
  // Copilot r4353760521: two tabs each start a payout; neither may overwrite the other.
  it('keeps every unfinished payout, so a second one cannot overwrite the first', () => {
    savePendingPayout(BOUNTY, payout('p1'));
    savePendingPayout(BOUNTY, payout('p2', { amount: 40 }));
    expect(loadPendingPayouts(BOUNTY).map(p => p.payoutRelationId)).toEqual(['p1', 'p2']);
  });

  it('updates a payout in place, keeping the oldest first', () => {
    savePendingPayout(BOUNTY, payout('p1'));
    savePendingPayout(BOUNTY, payout('p2'));
    savePendingPayout(BOUNTY, payout('p1', { stage: 'publish' }));
    expect(loadPendingPayouts(BOUNTY).map(p => [p.payoutRelationId, p.stage])).toEqual([
      ['p1', 'publish'],
      ['p2', 'credit'],
    ]);
  });

  it('clears only the finished payout', () => {
    savePendingPayout(BOUNTY, payout('p1'));
    savePendingPayout(BOUNTY, payout('p2'));
    clearPendingPayout(BOUNTY, 'p1');
    expect(loadPendingPayouts(BOUNTY).map(p => p.payoutRelationId)).toEqual(['p2']);
    clearPendingPayout(BOUNTY, 'p2');
    expect(window.localStorage.getItem(pendingPayoutStorageKey(BOUNTY))).toBeNull();
  });

  it('ignores malformed entries and unreadable storage', () => {
    window.localStorage.setItem(
      pendingPayoutStorageKey(BOUNTY),
      JSON.stringify({ good: payout('good'), bad: { stage: 'credit' } })
    );
    expect(loadPendingPayouts(BOUNTY).map(p => p.payoutRelationId)).toEqual(['good']);
    window.localStorage.setItem(pendingPayoutStorageKey(BOUNTY), '{not json');
    expect(loadPendingPayouts(BOUNTY)).toEqual([]);
  });
});
