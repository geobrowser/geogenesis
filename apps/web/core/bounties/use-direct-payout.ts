'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';

import type { BountyDetail } from './fetch-bounty-detail';
import { formatPoints } from './payout';
import { fetchSpaceBalance, recordPayoutCredit } from './payout-credit';
import { buildPayoutOps } from './payout-ops';
import { loadPendingCredit, savePendingCredit } from './pending-credit-storage';
import { bountyQueryKeys, useInvalidateSoon } from './use-bounties';

export type PayoutRecipient = {
  /** The curator's personal space id — its system entity is the recipient. */
  spaceId: string;
  name: string | null;
};

/** A payout whose relation is published but whose ledger credit has not gone through yet. */
export type PendingCredit = {
  payoutRelationId: string;
  recipient: PayoutRecipient;
  amount: number;
};

export type DirectPayoutOutcome =
  | { status: 'paid' }
  /** Refused before anything was published — nothing to undo. */
  | { status: 'not-paid'; message: string }
  | { status: 'publish-failed' }
  | { status: 'credit-failed'; message: string };

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
 * Two steps, as in curator-app: publish the Payout relation into the bounty's
 * DAO space (editor FAST path), then credit the points ledger. If the credit
 * fails after the publish, the payout is kept as `pendingCredit` (also in
 * localStorage, so it survives a reload) and `retryCredit` finishes it without
 * publishing a second Payout.
 */
export function useDirectPayout(detail: BountyDetail | null | undefined) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const bountyId = detail?.bounty.id ?? null;
  const [pendingCredit, setPendingCreditState] = React.useState<PendingCredit | null>(null);
  // Pick up a credit a previous visit left unfinished, so the dialog can offer to retry it.
  React.useEffect(() => {
    setPendingCreditState(bountyId ? loadPendingCredit(bountyId) : null);
  }, [bountyId]);
  const setPendingCredit = React.useCallback(
    (pending: PendingCredit | null) => {
      setPendingCreditState(pending);
      if (bountyId) savePendingCredit(bountyId, pending);
    },
    [bountyId]
  );

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );
  const invalidateSoon = useInvalidateSoon(invalidate);
  const refresh = React.useCallback(() => {
    void invalidate();
    invalidateSoon();
  }, [invalidate, invalidateSoon]);

  const credit = React.useCallback(
    async (pending: PendingCredit): Promise<DirectPayoutOutcome> => {
      if (!detail) return { status: 'credit-failed', message: 'Bounty not loaded.' };
      const identityToken = await getCachedIdentityToken();
      if (!identityToken) {
        return { status: 'credit-failed', message: 'Your sign-in expired. Sign in again, then retry the credit.' };
      }
      try {
        await recordPayoutCredit({
          spaceId: detail.bounty.spaceId,
          bountyId: detail.bounty.id,
          payoutEntityId: pending.payoutRelationId,
          recipientEntityId: pending.recipient.spaceId,
          amount: pending.amount,
          identityToken,
        });
        setPendingCredit(null);
        return { status: 'paid' };
      } catch (error) {
        return {
          status: 'credit-failed',
          message: error instanceof Error ? error.message : 'Could not credit the points ledger.',
        };
      }
    },
    [detail, setPendingCredit]
  );

  const pay = React.useCallback(
    async (recipient: PayoutRecipient, amount: number): Promise<DirectPayoutOutcome> => {
      // An unfinished credit must be retried, not paid over with a second Payout.
      if (!detail || pendingCredit) return { status: 'publish-failed' };
      setBusy(true);
      try {
        // The publish can't be taken back, and the ledger refuses (for good, a 4xx)
        // a payout it can't fund or an editor it can't authenticate. Check both
        // first, against a fresh balance rather than the dialog's cached one.
        if (!(await getCachedIdentityToken())) {
          return { status: 'not-paid', message: 'Your sign-in expired. Sign in again, then pay.' };
        }
        const balance = await fetchSpaceBalance(detail.bounty.spaceId);
        if (balance == null) {
          return { status: 'not-paid', message: "Couldn't read the space's balance, so nothing was paid. Try again." };
        }
        if (balance < amount) {
          return { status: 'not-paid', message: `This space only has ${formatPoints(balance)} points.` };
        }

        const payout = buildPayoutOps({
          spaceId: detail.bounty.spaceId,
          bounty: { id: detail.bounty.id, name: detail.bounty.name },
          recipient: { id: recipient.spaceId, name: recipient.name },
          amount,
          proposalIds: [],
        });
        const published = await publishOnce(makeProposal, {
          values: payout.values,
          relations: payout.relations,
          spaceId: detail.bounty.spaceId,
          name: `Payout: ${detail.bounty.name}`,
        });
        if (!published) return { status: 'publish-failed' };

        const pending: PendingCredit = { payoutRelationId: payout.payoutRelationId, recipient, amount };
        setPendingCredit(pending);
        refresh();
        return await credit(pending);
      } finally {
        setBusy(false);
      }
    },
    [credit, detail, makeProposal, pendingCredit, refresh, setPendingCredit]
  );

  const retryCredit = React.useCallback(async (): Promise<DirectPayoutOutcome> => {
    if (!pendingCredit) return { status: 'paid' };
    setBusy(true);
    try {
      const outcome = await credit(pendingCredit);
      if (outcome.status === 'paid') refresh();
      return outcome;
    } finally {
      setBusy(false);
    }
  }, [credit, pendingCredit, refresh]);

  return { pay, retryCredit, pendingCredit, busy };
}
