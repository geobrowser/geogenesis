'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

import type { BountyDetail } from './fetch-bounty-detail';
import type { GroupedSubmission } from './group-submissions';
import { buildPayoutOps } from './payout-ops';
import { type ReviewRatings, buildCreateReviewOps } from './review-ops';
import { bountyQueryKeys } from './use-bounties';
import type { BountyRoles } from './use-bounty-roles';

function publishOnce(
  makeProposal: ReturnType<typeof usePublish>['makeProposal'],
  args: Omit<Parameters<typeof makeProposal>[0], 'onSuccess' | 'onError'>
): Promise<boolean> {
  return new Promise(resolve => {
    void makeProposal({ ...args, onSuccess: () => resolve(true), onError: () => resolve(false) });
  });
}

const REFETCH_DELAYS_MS = [3_000, 7_000, 12_000];

export type ReviewSubmitInput = {
  submission: GroupedSubmission;
  stars: ReviewRatings;
  pass: boolean;
  comment: string;
  /** Whole points; optional even when pass is true. */
  payoutAmount: number | null;
};

export type ReviewOutcome = { status: 'saved' } | { status: 'saved-and-paid' } | { status: 'failed'; reason: string };

/**
 * Review and payout, both plain knowledge-graph publishes:
 *  1. the Bounty review entity into the reviewer's personal space;
 *  2. when the review passes with a payout amount, the Payout relation entity
 *     into the bounty's DAO space (editor FAST publish).
 * A failing review is what marks a submission rejected; a payout is what marks
 * it paid — there is no external lifecycle service.
 */
export function useReviewPayoutActions(detail: BountyDetail | null | undefined, roles: BountyRoles) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  // Newly published reviews/payouts take a few seconds to be indexed, so one
  // refetch right after the publish usually misses them. Re-invalidate a few
  // times on a short schedule.
  const invalidateSoon = React.useCallback(() => {
    for (const delay of REFETCH_DELAYS_MS) window.setTimeout(() => void invalidate(), delay);
  }, [invalidate]);

  const submitReview = React.useCallback(
    async (input: ReviewSubmitInput): Promise<ReviewOutcome> => {
      if (!detail || !roles.personalSpaceId) return { status: 'failed', reason: 'Not ready' };
      const { submission } = input;
      setBusyKey(submission.submissionKey);
      try {
        // 1. The review itself, into the reviewer's personal space.
        const review = buildCreateReviewOps({
          reviewerSpaceId: roles.personalSpaceId,
          bountySpaceId: detail.bounty.spaceId,
          name: `Review of ${submission.creatorName ?? 'submission'} — ${detail.bounty.name}`,
          proposalIds: submission.proposalIds,
          pass: input.pass,
          comment: input.comment,
          ratings: input.stars,
        });
        const reviewed = await publishOnce(makeProposal, {
          values: review.values,
          relations: review.relations,
          spaceId: roles.personalSpaceId,
          name: `Review: ${detail.bounty.name}`,
        });
        if (!reviewed) return { status: 'failed', reason: 'Review publish failed' };

        if (!input.pass || input.payoutAmount == null || input.payoutAmount <= 0) {
          await invalidate();
          invalidateSoon();
          setToast(<>Review saved.</>);
          return { status: 'saved' };
        }

        // 2. The payout, into the bounty's DAO space.
        const recipient = { id: submission.creatorEntityId, name: submission.creatorName };
        const payout = buildPayoutOps({
          spaceId: detail.bounty.spaceId,
          bounty: { id: detail.bounty.id, name: detail.bounty.name },
          recipient,
          amount: input.payoutAmount,
          proposalIds: submission.proposalIds,
        });
        const paid = await publishOnce(makeProposal, {
          values: payout.values,
          relations: payout.relations,
          spaceId: detail.bounty.spaceId,
          name: `Payout: ${detail.bounty.name}`,
        });
        if (!paid) {
          await invalidate();
          return { status: 'failed', reason: 'Review saved, but the payout could not be published' };
        }

        await invalidate();
        invalidateSoon();
        setToast(<>Review and payout saved.</>);
        return { status: 'saved-and-paid' };
      } finally {
        setBusyKey(null);
      }
    },
    [detail, invalidate, invalidateSoon, makeProposal, roles.personalSpaceId, setToast]
  );

  return { submitReview, busyKey };
}
