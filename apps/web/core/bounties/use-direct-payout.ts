'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';
import { uuidToHex } from '~/core/id/normalize';
import type { Relation, Value } from '~/core/types';

import type { BountyDetail } from './fetch-bounty-detail';
import { fetchPayoutItems } from './fetch-submissions';
import { fetchSpaceBalance, ledgerMovedNoPoints, recordPayoutCredit } from './payout-credit';
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
  | { status: 'publish-failed' }
  /**
   * The points moved and the record was proposed, but it hasn't appeared in the
   * graph — e.g. its proposal is still waiting for a vote in Governance. Finishing
   * later checks again before proposing anything.
   */
  | { status: 'publish-unconfirmed' };

/**
 * When to look for a just-published Payout. In a DAO space a successful publish
 * only means *proposed* (the editor fast path's vote + execute is non-fatal), and
 * the indexer lags an executed one by a few seconds.
 */
const PUBLISH_CONFIRM_DELAYS_MS = [2_000, 5_000, 10_000];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Whether the bounty's Payouts (read from its own space) include this payout relation. */
async function isPayoutInGraph(bountyId: string, spaceId: string, payoutRelationId: string): Promise<boolean> {
  const items = await Effect.runPromise(fetchPayoutItems(bountyId, spaceId)).catch(() => null);
  const target = uuidToHex(payoutRelationId);
  return items?.some(item => uuidToHex(item.id) === target) ?? false;
}

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
 * completes it. It counts as paid only once the Payout is seen in the graph.
 */
export function useDirectPayout(
  detail: BountyDetail | null | undefined,
  options: { wait?: (ms: number) => Promise<void> } = {}
) {
  const wait = options.wait ?? sleep;
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
          // Dropped only when certainly nothing moved — otherwise a payout whose points
          // may have moved would vanish. A definite refusal (e.g. no balance) also clears
          // a stuck retry, so it can't block every later payout on the bounty.
          if (ledgerMovedNoPoints(error, firstAttempt)) {
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

      const { id: bountyId, spaceId } = detail.bounty;
      const landed = () => isPayoutInGraph(bountyId, spaceId, current.payoutRelationId);
      const done = (): DirectPayoutOutcome => {
        setPendingPayout(null);
        void invalidate();
        invalidateSoon();
        return { status: 'paid' };
      };

      // An earlier attempt's proposal may have executed since (e.g. from Governance):
      // recognise it rather than propose the same Payout twice.
      if (pending.stage === 'publish' && (await landed())) return done();

      const published = await publishOnce(makeProposal, {
        values: current.values,
        relations: current.relations,
        spaceId,
        name: `Payout: ${detail.bounty.name}`,
      });
      if (!published) return { status: 'publish-failed' };

      // Paid only once the record is actually in the graph, not merely proposed.
      for (const delay of PUBLISH_CONFIRM_DELAYS_MS) {
        await wait(delay);
        if (await landed()) return done();
      }
      return { status: 'publish-unconfirmed' };
    },
    [detail, invalidate, invalidateSoon, makeProposal, setPendingPayout, wait]
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
