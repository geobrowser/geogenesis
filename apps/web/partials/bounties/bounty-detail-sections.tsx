'use client';

import * as React from 'react';

import { type GroupedSubmission, reviewsBySubmissionKey } from '~/core/bounties/group-submissions';
import { useBountyDetail } from '~/core/bounties/use-bounty-detail';
import { useBountyRoles } from '~/core/bounties/use-bounty-roles';
import { useBountySubmissions } from '~/core/bounties/use-bounty-submissions';
import { useEntityNames } from '~/core/bounties/use-entity-names';
import { useReviewPayoutActions } from '~/core/bounties/use-review-payout-actions';

import { BountyAllocationTabs } from './bounty-allocation-tabs';
import { BountyPayoutsTable } from './bounty-payouts-table';
import { BountyReviewDialog } from './bounty-review-dialog';
import { BountySubmissionsTable } from './bounty-submissions-table';

type Props = {
  spaceId: string;
  bountyId: string;
};

/**
 * Rendered in the entity page's belowBodySlot for Bounty-typed entities: the
 * sections that follow the brief — submissions (grouped proposals with review
 * and payout actions), payouts, and who is allocated.
 */
export function BountyDetailSections({ spaceId, bountyId }: Props) {
  const { data } = useBountyDetail(spaceId, bountyId);
  const roles = useBountyRoles(data?.bounty, data?.interest ?? []);
  const submissions = useBountySubmissions(data, roles);
  const actions = useReviewPayoutActions(data, roles);
  const [reviewing, setReviewing] = React.useState<GroupedSubmission | null>(null);
  const reviewsByKey = React.useMemo(
    () => reviewsBySubmissionKey(submissions.grouped, submissions.reviews),
    [submissions.grouped, submissions.reviews]
  );
  const reviewerNames = useEntityNames(submissions.reviews.map(review => review.spaceId));

  if (!data) return null;

  return (
    <div className="flex flex-col gap-8" data-testid="bounty-detail-sections">
      <BountySubmissionsTable
        spaceId={spaceId}
        submissions={submissions.grouped}
        reviewsByKey={reviewsByKey}
        isLoading={submissions.isLoading}
        isError={submissions.isError}
        busyKey={actions.busyKey}
        onOpenReview={setReviewing}
        onRefresh={() => void submissions.refetch()}
      />
      <BountyPayoutsTable spaceId={spaceId} payouts={submissions.payouts} />
      <BountyAllocationTabs detail={data} roles={roles} />

      <BountyReviewDialog
        bounty={data.bounty}
        submission={reviewing}
        open={reviewing !== null}
        onOpenChange={open => {
          if (!open) setReviewing(null);
        }}
        onSubmit={actions.submitReview}
        busy={reviewing !== null && actions.busyKey === reviewing.submissionKey}
        existingReviews={reviewing ? (reviewsByKey.get(reviewing.submissionKey) ?? []) : []}
        reviewerNames={reviewerNames.data}
        canReview={reviewing?.canReviewAndPayout ?? false}
      />
    </div>
  );
}
