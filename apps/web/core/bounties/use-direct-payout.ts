'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';
import type { Relation, Value } from '~/core/types';

import type { BountyDetail } from './fetch-bounty-detail';
import { fetchSpaceBalance, isLedgerRefusal, recordPayoutCredit } from './payout-credit';
import { buildPayoutOps } from './payout-ops';
import { loadPendingPayout, savePendingPayout } from './pending-payout-storage';
import { bountyQueryKeys, useInvalidateSoon } from './use-bounties';

export type PayoutRecipient = {
  /** The curator's personal space id — its system entity is the recipient. */
  spaceId: string;
  name: string | null;
};

/** A payout that has started but not finished. */
export type PendingPayout = {
  /**
   * `credit`: the ledger has not confirmed the points moved (they may have).
   * `publish`: the points moved; the Payout record is not in the graph yet.
   */
  stage: 'credit' | 'publish';
  payoutRelationId: string;
  recipient: PayoutRecipient;
  amount: number;
  /** The exact Payout ops, so finishing publishes the ids the ledger recorded. */
  values: Value[];
  relations: Relation[];
};

export type DirectPayoutOutcome =
  | { status: 'paid' }
  /** The ledger turned it down; nothing happened anywhere. */
  | { status: 'not-paid'; message: string }
  /** The ledger didn't confirm; the points may or may not have moved. Safe to retry. */
  | { status: 'credit-unconfirmed'; message: string }
  /** The points moved but the Payout record isn't published yet. Safe to retry. */
  | { status: 'publish-failed' };

export function spaceBalanceQueryKey(spaceId: string) {
  return [...bountyQueryKeys.all, 'space-balance', spaceId] as const;
}

/** The bounty space's spendable points balance from the curator ledger. */
export function useSpaceBalance(spaceId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: spaceBalanceQueryKey(spaceId ?? ''),
    enabled: enabled && !!spaceId,
    staleTime: 30_000,
    queryFn: () => fetchSpaceBalance(spaceId!),
  });
}

/**
 * Pays an allocated curator directly — no review, no linked proposal — for
 * work done outside the bounty space (e.g. in the curator's personal space).
 *
 * Ledger first, then graph. The ledger checks the balance and records the
 * payout id atomically, so it decides — race-free — whether the payout happens
 * at all; only then is the Payout relation published into the bounty's DAO
 * space (editor FAST path). Each step is safe to repeat (idempotent payout id,
 * same publish ids), so a payout interrupted at either step is kept as
 * `pendingPayout` — in localStorage too, to survive a reload — and `finish`
 * completes it.
 */
export function useDirectPayout(detail: BountyDetail | null | undefined) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const bountyId = detail?.bounty.id ?? null;
  const [pendingPayout, setPendingPayoutState] = React.useState<PendingPayout | null>(null);
  // Pick up a payout a previous visit left unfinished, so the editor can finish it.
  React.useEffect(() => {
    setPendingPayoutState(bountyId ? loadPendingPayout(bountyId) : null);
  }, [bountyId]);
  const setPendingPayout = React.useCallback(
    (pending: PendingPayout | null) => {
      setPendingPayoutState(pending);
      if (bountyId) savePendingPayout(bountyId, pending);
    },
    [bountyId]
  );

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );
  const invalidateSoon = useInvalidateSoon(invalidate);

  /**
   * Moves a pending payout forward from its stage. `firstAttempt` is true only
   * for a brand-new payout: then a ledger refusal (or no sign-in) means nothing
   * happened, and the payout is dropped instead of left pending.
   */
  const advance = React.useCallback(
    async (pending: PendingPayout, firstAttempt: boolean): Promise<DirectPayoutOutcome> => {
      if (!detail) return { status: 'credit-unconfirmed', message: 'Bounty not loaded.' };
      let current = pending;

      if (current.stage === 'credit') {
        const identityToken = await getCachedIdentityToken();
        if (!identityToken) {
          const message = 'Your sign-in expired. Sign in again, then pay.';
          if (firstAttempt) {
            setPendingPayout(null);
            return { status: 'not-paid', message };
          }
          return { status: 'credit-unconfirmed', message };
        }
        try {
          await recordPayoutCredit({
            spaceId: detail.bounty.spaceId,
            bountyId: detail.bounty.id,
            payoutEntityId: current.payoutRelationId,
            recipientEntityId: current.recipient.spaceId,
            amount: current.amount,
            identityToken,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not reach the points ledger.';
          if (firstAttempt && isLedgerRefusal(error)) {
            setPendingPayout(null);
            void invalidate(); // the balance the dialog showed was evidently stale
            return { status: 'not-paid', message };
          }
          return { status: 'credit-unconfirmed', message };
        }
        current = { ...current, stage: 'publish' };
        setPendingPayout(current);
        void invalidate();
      }

      const published = await publishOnce(makeProposal, {
        values: current.values,
        relations: current.relations,
        spaceId: detail.bounty.spaceId,
        name: `Payout: ${detail.bounty.name}`,
      });
      if (!published) return { status: 'publish-failed' };

      setPendingPayout(null);
      void invalidate();
      invalidateSoon();
      return { status: 'paid' };
    },
    [detail, invalidate, invalidateSoon, makeProposal, setPendingPayout]
  );

  const pay = React.useCallback(
    async (recipient: PayoutRecipient, amount: number): Promise<DirectPayoutOutcome> => {
      // An unfinished payout must be finished, not paid over with a second one.
      if (!detail || pendingPayout)
        return { status: 'not-paid', message: 'Finish the payout already in progress first.' };
      setBusy(true);
      try {
        // Ids are minted now so the ledger and the graph record the same payout.
        const payout = buildPayoutOps({
          spaceId: detail.bounty.spaceId,
          bounty: { id: detail.bounty.id, name: detail.bounty.name },
          recipient: { id: recipient.spaceId, name: recipient.name },
          amount,
          proposalIds: [],
        });
        const pending: PendingPayout = {
          stage: 'credit',
          payoutRelationId: payout.payoutRelationId,
          recipient,
          amount,
          values: payout.values,
          relations: payout.relations,
        };
        // Recorded before the ledger call: if the tab dies mid-request, the
        // points may have moved and this is what lets the editor finish.
        setPendingPayout(pending);
        return await advance(pending, true);
      } finally {
        setBusy(false);
      }
    },
    [advance, detail, pendingPayout, setPendingPayout]
  );

  const finish = React.useCallback(async (): Promise<DirectPayoutOutcome> => {
    if (!pendingPayout) return { status: 'paid' };
    setBusy(true);
    try {
      return await advance(pendingPayout, false);
    } finally {
      setBusy(false);
    }
  }, [advance, pendingPayout]);

  return { pay, finish, pendingPayout, busy };
}
