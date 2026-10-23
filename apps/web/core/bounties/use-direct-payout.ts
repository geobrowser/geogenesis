'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';
import { createEntityId } from '~/core/id/create-id';
import { uuidToHex } from '~/core/id/normalize';
import type { Relation, Value } from '~/core/types';
import { sleep } from '~/core/utils/utils';

import type { BountyDetail } from './fetch-bounty-detail';
import { fetchPayoutItems, fetchProposalStatuses } from './fetch-submissions';
import { fetchSpaceBalance, ledgerMovedNoPoints, recordPayoutCredit } from './payout-credit';
import { buildPayoutOps } from './payout-ops';
import { clearPendingPayout, loadPendingPayouts, savePendingPayout } from './pending-payout-storage';
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
  /**
   * The DAO proposal that carries the record, once one was created. Finishing
   * asks Governance about it before proposing again, so a payout waiting on a
   * vote doesn't pile up identical proposals.
   */
  proposalId?: string | null;
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
   * graph yet (or the graph couldn't be read). Finishing later checks again
   * before proposing anything.
   */
  | { status: 'publish-unconfirmed' }
  /** The points moved; the record's proposal is open in Governance (awaiting a vote or execution). */
  | { status: 'awaiting-governance' };

/**
 * When to look for a just-published Payout. In a DAO space a successful publish
 * only means *proposed* (the editor fast path's vote + execute is non-fatal), and
 * the indexer lags an executed one by a few seconds.
 */
const PUBLISH_CONFIRM_DELAYS_MS = [2_000, 5_000, 10_000];

/**
 * Whether the bounty's Payouts (read from its own space) include this payout
 * relation — or `unknown` when the read itself failed, which is not the same as
 * absent: treating it as absent would propose a Payout that may already exist.
 */
async function isPayoutInGraph(
  bountyId: string,
  spaceId: string,
  payoutRelationId: string
): Promise<boolean | 'unknown'> {
  const items = await Effect.runPromise(fetchPayoutItems(bountyId, spaceId)).catch(() => null);
  if (items === null) return 'unknown';
  const target = uuidToHex(payoutRelationId);
  return items.some(item => uuidToHex(item.id) === target);
}

/**
 * Where the payout's proposal stands: `open` (awaiting a vote, or passed and
 * awaiting execution), `rejected` (rejected or canceled — safe to propose again),
 * or `unknown` (not indexed yet, unreadable, or executed but not yet indexed as a
 * Payout — wait, don't guess).
 */
async function proposalState(proposalId: string): Promise<'open' | 'rejected' | 'unknown'> {
  const statuses = await Effect.runPromise(fetchProposalStatuses([proposalId]));
  const status = statuses.get(uuidToHex(proposalId));
  if (status === 'PROPOSED' || status === 'ACCEPTED') return 'open';
  if (status === 'REJECTED' || status === 'CANCELED') return 'rejected';
  return 'unknown';
}

/** Merges payout lists by id; the first list wins on a clash. */
function mergePending(primary: PendingPayout[], secondary: PendingPayout[]): PendingPayout[] {
  const ids = new Set(primary.map(p => p.payoutRelationId));
  return [...primary, ...secondary.filter(p => !ids.has(p.payoutRelationId))];
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
 * payout id, so it decides whether the payout happens at all (though not
 * safely against a concurrent different payout; see `payout-credit.ts`); only
 * then is the Payout relation published into the bounty's DAO space (editor
 * FAST path). Each step is safe to repeat (idempotent payout id,
 * same publish ids), so a payout interrupted at either step is kept as
 * `pendingPayout` — in localStorage too, to survive a reload — and `finish`
 * completes it. It counts as paid only once the Payout is seen in the graph.
 */
export function useDirectPayout(
  detail: BountyDetail | null | undefined,
  options: { wait?: (ms: number) => Promise<unknown> } = {}
) {
  const wait = options.wait ?? sleep;
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const bountyId = detail?.bounty.id ?? null;
  // Every unfinished payout this tab knows of: stored ones (other visits and other
  // tabs) plus its own, which matter on their own when storage is unavailable.
  const [pendingPayouts, setPendingPayouts] = React.useState<PendingPayout[]>([]);
  const pendingPayout = pendingPayouts[0] ?? null;

  /** Re-reads storage; returns everything now known to be unfinished. */
  const syncFromStorage = React.useCallback((): PendingPayout[] => {
    const known = mergePending(bountyId ? loadPendingPayouts(bountyId) : [], pendingPayouts);
    setPendingPayouts(known);
    return known;
  }, [bountyId, pendingPayouts]);

  // Pick up payouts a previous visit left unfinished, and follow other tabs' payouts.
  React.useEffect(() => {
    setPendingPayouts(bountyId ? loadPendingPayouts(bountyId) : []);
    if (!bountyId) return;
    const onStorage = () => setPendingPayouts(prev => mergePending(loadPendingPayouts(bountyId), prev));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [bountyId]);

  const keepPending = React.useCallback(
    (pending: PendingPayout) => {
      setPendingPayouts(prev =>
        prev.some(p => p.payoutRelationId === pending.payoutRelationId)
          ? prev.map(p => (p.payoutRelationId === pending.payoutRelationId ? pending : p))
          : [...prev, pending]
      );
      if (bountyId) savePendingPayout(bountyId, pending);
    },
    [bountyId]
  );
  const dropPending = React.useCallback(
    (payoutRelationId: string) => {
      setPendingPayouts(prev => prev.filter(p => p.payoutRelationId !== payoutRelationId));
      if (bountyId) clearPendingPayout(bountyId, payoutRelationId);
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
            dropPending(current.payoutRelationId);
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
            dropPending(current.payoutRelationId);
            void invalidate(); // the balance the dialog showed was evidently stale
            return { status: 'not-paid', message };
          }
          return { status: 'credit-unconfirmed', message };
        }
        current = { ...current, stage: 'publish' };
        keepPending(current);
        void invalidate();
      }

      const { id: bountyId, spaceId } = detail.bounty;
      const landed = () => isPayoutInGraph(bountyId, spaceId, current.payoutRelationId);
      const done = (): DirectPayoutOutcome => {
        dropPending(current.payoutRelationId);
        void invalidate();
        invalidateSoon();
        return { status: 'paid' };
      };

      // Finishing, the record may already exist — an earlier proposal executed late
      // (e.g. from Governance), or another tab finished this payout. Recognise it
      // rather than propose the same Payout twice; if the graph can't be read, don't
      // guess. A brand-new payout's record can't exist yet, so it skips the check.
      if (!firstAttempt) {
        const before = await landed();
        if (before === true) return done();
        if (before === 'unknown') return { status: 'publish-unconfirmed' };
        // Not in the graph yet. If its proposal is still open, proposing again would only
        // add an identical one to Governance; propose again only once it was rejected.
        if (current.proposalId) {
          const state = await proposalState(current.proposalId);
          if (state === 'open') return { status: 'awaiting-governance' };
          if (state === 'unknown') return { status: 'publish-unconfirmed' };
        }
      }

      // A fresh proposal id each time: a rejected proposal's id can't be reused.
      const proposalId = createEntityId();
      const published = await publishOnce(makeProposal, {
        values: current.values,
        relations: current.relations,
        spaceId,
        name: `Payout: ${detail.bounty.name}`,
        proposalId,
      });
      if (!published) return { status: 'publish-failed' };
      current = { ...current, proposalId };
      keepPending(current);

      // Paid only once the record is actually in the graph, not merely proposed.
      for (const delay of PUBLISH_CONFIRM_DELAYS_MS) {
        await wait(delay);
        if ((await landed()) === true) return done();
      }
      return { status: 'publish-unconfirmed' };
    },
    [detail, dropPending, invalidate, invalidateSoon, keepPending, makeProposal, wait]
  );

  const pay = React.useCallback(
    async (recipient: PayoutRecipient, amount: number): Promise<DirectPayoutOutcome> => {
      // An unfinished payout must be finished, not paid over with a second one —
      // including one another tab started after this tab last read storage.
      if (!detail || syncFromStorage().length > 0)
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
        keepPending(pending);
        return await advance(pending, true);
      } finally {
        setBusy(false);
      }
    },
    [advance, detail, keepPending, syncFromStorage]
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
