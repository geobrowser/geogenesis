'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

import {
  CuratorApiError,
  type PayoutCreditInput,
  createPayoutCredit,
  markSubmissionPaid,
  rejectSubmission,
  requestSubmissionReview,
} from './api';
import type { BountyDetail } from './fetch-bounty-detail';
import type { GroupedSubmission, SubmissionSegmentInput } from './group-submissions';
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

function toApiSegment(spaceId: string, bountyId: string, segment: SubmissionSegmentInput) {
  return {
    spaceId,
    bountyId,
    submissionKey: segment.submissionKey,
    creatorEntityId: segment.creatorEntityId,
    firstProposalId: segment.firstProposalId,
    proposalIds: segment.proposalIds,
    lastActiveAt: segment.lastActiveAt.toISOString(),
  };
}

const REFETCH_DELAYS_MS = [3_000, 7_000, 12_000];

/** A payout that reached the graph but whose points credit did not land — held for retry. */
export type PendingPayoutCredit = PayoutCreditInput & { segment: SubmissionSegmentInput };

export type ReviewSubmitInput = {
  submission: GroupedSubmission;
  stars: ReviewRatings;
  pass: boolean;
  comment: string;
  /** Whole points; required when pass is true. */
  payoutAmount: number | null;
};

export type ReviewOutcome =
  | { status: 'saved' }
  | { status: 'saved-and-paid' }
  | { status: 'credit-pending'; pending: PendingPayoutCredit }
  | { status: 'lifecycle-pending' }
  | { status: 'failed'; reason: string };

/**
 * Editor and curator lifecycle actions on a submission row. The payout is the
 * critical write and follows curator-app's three phases with the same
 * failure semantics:
 *  1. KG payout entity into the DAO space (editor FAST publish);
 *  2. curator-backend points credit — on failure keep a PendingPayoutCredit and
 *     offer Retry (the backend is idempotent on the payout relation id, so a
 *     retry after an ambiguous failure cannot double-decrement);
 *  3. mark the lifecycle record paid — on failure the row's needsPayoutRetry
 *     surfaces "Retry" on the detail page (payout on KG, lifecycle ≠ paid).
 */
export function useReviewPayoutActions(detail: BountyDetail | null | undefined, roles: BountyRoles) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [pendingCredit, setPendingCredit] = React.useState<PendingPayoutCredit | null>(null);

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  // Newly published reviews/payouts take a few seconds to be indexed, so one
  // refetch right after the publish usually misses them. Re-invalidate a few
  // times on a short schedule (curator-app polls for the same reason).
  const invalidateSoon = React.useCallback(() => {
    for (const delay of REFETCH_DELAYS_MS) window.setTimeout(() => void invalidate(), delay);
  }, [invalidate]);

  const spaceId = detail?.bounty.spaceId ?? '';
  const bountyId = detail?.bounty.id ?? '';

  const runLifecycle = React.useCallback(
    async (
      segment: SubmissionSegmentInput,
      action: typeof requestSubmissionReview,
      successMessage: string
    ): Promise<boolean> => {
      setBusyKey(segment.submissionKey);
      try {
        await action(toApiSegment(spaceId, bountyId, segment));
        await invalidate();
        setToast(<>{successMessage}</>);
        return true;
      } catch (error) {
        const reason = error instanceof CuratorApiError ? error.message : 'Curator service unavailable';
        setToast(<>Couldn&apos;t update the submission: {reason}</>);
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [bountyId, invalidate, setToast, spaceId]
  );

  const requestReview = React.useCallback(
    (segment: SubmissionSegmentInput) => runLifecycle(segment, requestSubmissionReview, 'Review requested.'),
    [runLifecycle]
  );

  const reject = React.useCallback(
    (segment: SubmissionSegmentInput) => runLifecycle(segment, rejectSubmission, 'Submission rejected.'),
    [runLifecycle]
  );

  const retryMarkPaid = React.useCallback(
    (segment: SubmissionSegmentInput) => runLifecycle(segment, markSubmissionPaid, 'Submission marked as paid.'),
    [runLifecycle]
  );

  const retryPayoutCredit = React.useCallback(async (): Promise<boolean> => {
    if (!pendingCredit) return false;
    setBusyKey(pendingCredit.segment.submissionKey);
    try {
      await createPayoutCredit(pendingCredit);
      setPendingCredit(null);
      const marked = await markSubmissionPaid(toApiSegment(spaceId, bountyId, pendingCredit.segment)).then(
        () => true,
        () => false
      );
      await invalidate();
      setToast(
        marked ? (
          <>Points credited and submission marked paid.</>
        ) : (
          <>Points credited. Mark the submission paid to finish.</>
        )
      );
      return true;
    } catch (error) {
      const reason = error instanceof CuratorApiError ? error.message : 'Curator service unavailable';
      setToast(<>Points credit failed again: {reason}</>);
      return false;
    } finally {
      setBusyKey(null);
    }
  }, [bountyId, invalidate, pendingCredit, setToast, spaceId]);

  const submitReview = React.useCallback(
    async (input: ReviewSubmitInput): Promise<ReviewOutcome> => {
      if (!detail || !roles.personalSpaceId) return { status: 'failed', reason: 'Not ready' };
      const { submission } = input;
      setBusyKey(submission.submissionKey);
      try {
        // 0. The review itself, into the reviewer's personal space.
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

        if (!input.pass) {
          await rejectSubmission(toApiSegment(spaceId, bountyId, submission.segmentInput)).catch(() => {});
          await invalidate();
          invalidateSoon();
          setToast(<>Review saved.</>);
          return { status: 'saved' };
        }

        if (input.payoutAmount == null || input.payoutAmount <= 0) {
          await invalidate();
          invalidateSoon();
          setToast(<>Review saved.</>);
          return { status: 'saved' };
        }

        // 1. KG payout.
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

        // 2. Points credit.
        const credit: PendingPayoutCredit = {
          spaceId: detail.bounty.spaceId,
          amount: Math.round(input.payoutAmount),
          bountyId: detail.bounty.id,
          payoutEntityId: payout.payoutRelationId,
          recipientEntityId: submission.creatorEntityId,
          segment: submission.segmentInput,
        };
        try {
          await createPayoutCredit(credit);
        } catch {
          setPendingCredit(credit);
          await invalidate();
          setToast(<>Payout published, but the points credit failed. Retry when the curator service is back.</>);
          return { status: 'credit-pending', pending: credit };
        }

        // 3. Lifecycle.
        const marked = await markSubmissionPaid(toApiSegment(spaceId, bountyId, submission.segmentInput)).then(
          () => true,
          () => false
        );
        await invalidate();
        invalidateSoon();
        setToast(marked ? <>Review and payout saved.</> : <>Payout saved. Mark the submission paid to finish.</>);
        return marked ? { status: 'saved-and-paid' } : { status: 'lifecycle-pending' };
      } finally {
        setBusyKey(null);
      }
    },
    [bountyId, detail, invalidate, invalidateSoon, makeProposal, roles.personalSpaceId, setToast, spaceId]
  );

  return { requestReview, reject, retryMarkPaid, retryPayoutCredit, submitReview, busyKey, pendingCredit };
}
