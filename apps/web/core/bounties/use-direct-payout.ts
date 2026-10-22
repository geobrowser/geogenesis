'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';

import type { BountyDetail } from './fetch-bounty-detail';
import { fetchSpaceBalance, recordPayoutCredit } from './payout-credit';
import { buildPayoutOps } from './payout-ops';
import { bountyQueryKeys } from './use-bounties';

const REFETCH_DELAYS_MS = [3_000, 7_000, 12_000];

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
  { status: 'paid' } | { status: 'publish-failed' } | { status: 'credit-failed'; message: string };

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
 * fails after the publish, the payout is kept as `pendingCredit` and
 * `retryCredit` finishes it without publishing a second Payout.
 */
export function useDirectPayout(detail: BountyDetail | null | undefined) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [pendingCredit, setPendingCredit] = React.useState<PendingCredit | null>(null);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all });
    // New payouts take a few seconds to be indexed; one refetch usually misses them.
    for (const delay of REFETCH_DELAYS_MS) {
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }), delay);
    }
  }, [queryClient]);

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
    [detail]
  );

  const pay = React.useCallback(
    async (recipient: PayoutRecipient, amount: number): Promise<DirectPayoutOutcome> => {
      // An unfinished credit must be retried, not paid over with a second Payout.
      if (!detail || pendingCredit) return { status: 'publish-failed' };
      setBusy(true);
      try {
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
    [credit, detail, makeProposal, pendingCredit, refresh]
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
