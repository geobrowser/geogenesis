'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SubmissionLifecycleStatus } from '~/core/bounties/api';
import type { BountyReview } from '~/core/bounties/fetch-submissions';
import type { GroupedSubmission, SubmissionSegmentInput } from '~/core/bounties/group-submissions';
import { formatPoints } from '~/core/bounties/payout';
import type { PendingPayoutCredit } from '~/core/bounties/use-review-payout-actions';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

const STATUS_LABELS: Record<SubmissionLifecycleStatus, { label: string; className: string }> = {
  'in-progress': { label: 'In progress', className: 'bg-grey-02 text-grey-04' },
  'ready-for-review': { label: 'Ready for review', className: 'bg-purple/10 text-purple' },
  paid: { label: 'Paid', className: 'bg-green/10 text-green' },
  rejected: { label: 'Rejected', className: 'bg-red-01/10 text-red-01' },
};

/** Average of the four 0..1 ratings as stars out of 5, one decimal. */
export function reviewStars(review: Pick<BountyReview, 'ratings'>): number {
  const { completeness, accuracy, skill, effort } = review.ratings;
  return Math.round(((completeness + accuracy + skill + effort) / 4) * 5 * 10) / 10;
}

type Props = {
  spaceId: string;
  submissions: GroupedSubmission[];
  /** Existing reviews per submission key (matched by proposal set). */
  reviewsByKey?: Map<string, BountyReview[]>;
  isLoading: boolean;
  isError: boolean;
  lifecycleUnavailable: boolean;
  busyKey: string | null;
  pendingCredit: PendingPayoutCredit | null;
  onRequestReview: (segment: SubmissionSegmentInput) => void;
  onOpenReview: (submission: GroupedSubmission) => void;
  onRetryMarkPaid: (segment: SubmissionSegmentInput) => void;
  onRetryCredit: () => void;
  onRefresh: () => void;
};

export function BountySubmissionsTable({
  spaceId,
  submissions,
  reviewsByKey,
  isLoading,
  isError,
  lifecycleUnavailable,
  busyKey,
  pendingCredit,
  onRequestReview,
  onOpenReview,
  onRetryMarkPaid,
  onRetryCredit,
  onRefresh,
}: Props) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section aria-label="Submissions" data-testid="bounty-submissions" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <Text as="h2" variant="smallTitle">
          Submissions
        </Text>
        <Text variant="metadata" color="grey-04">
          Proposals in this space linked to the bounty, grouped per curator.
        </Text>
      </div>

      {lifecycleUnavailable ? (
        <Text variant="footnote" color="grey-04">
          Review status is unavailable right now — every row shows as in progress until the curator service is back.
        </Text>
      ) : null}

      {pendingCredit ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-orange bg-orange/10 px-3 py-2">
          <Text variant="metadata">
            A payout of {formatPoints(pendingCredit.amount)} points was published, but the points credit did not land.
          </Text>
          <SmallButton onClick={onRetryCredit} disabled={busyKey === pendingCredit.segment.submissionKey}>
            Retry credit
          </SmallButton>
        </div>
      ) : null}

      {isLoading ? (
        <Text variant="metadata" color="grey-04">
          Loading submissions…
        </Text>
      ) : isError ? (
        <div className="flex items-center gap-3">
          <Text variant="metadata" color="grey-04">
            Couldn&apos;t load submissions.
          </Text>
          <SmallButton onClick={onRefresh}>Try again</SmallButton>
        </div>
      ) : submissions.length === 0 ? (
        <Text variant="metadata" color="grey-04">
          There are no submissions yet.
        </Text>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-grey-02">
          <table className="w-full min-w-[720px] text-metadata">
            <thead className="bg-bg text-left text-grey-04">
              <tr>
                <th className="px-3 py-2 font-medium">Curator</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last active</th>
                <th className="px-3 py-2 font-medium">Proposals</th>
                <th className="px-3 py-2 font-medium">Payout</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-02">
              {submissions.map(submission => {
                const status = STATUS_LABELS[submission.status];
                const busy = busyKey === submission.submissionKey;
                const isOpen = expanded.has(submission.submissionKey);
                const reviews = reviewsByKey?.get(submission.submissionKey) ?? [];
                const latestReview = reviews[0];
                return (
                  <React.Fragment key={submission.submissionKey}>
                    <tr data-testid="submission-row" data-status={submission.status}>
                      <td className="px-3 py-2">
                        <Link
                          href={NavUtils.toEntity(spaceId, submission.creatorEntityId.replace(/^unknown:/, ''))}
                          className="hover:underline"
                        >
                          {submission.creatorName ?? 'Unknown curator'}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cx('rounded-sm px-1.5 py-0.5 text-footnote', status.className)}>
                          {status.label}
                        </span>
                        {submission.needsPayoutRetry ? (
                          <span className="ml-2 text-footnote text-orange">Lifecycle out of sync</span>
                        ) : null}
                        {latestReview ? (
                          <span
                            className={cx('ml-2 text-footnote', latestReview.pass ? 'text-green' : 'text-red-01')}
                            data-testid="review-indicator"
                          >
                            Reviewed · {latestReview.pass ? 'Pass' : 'Fail'} · ★ {reviewStars(latestReview)}
                            {reviews.length > 1 ? ` · ${reviews.length} reviews` : ''}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-grey-04">{submission.lastActiveAt.toLocaleDateString('en-US')}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(submission.submissionKey)}
                          aria-expanded={isOpen}
                          className="text-ctaPrimary hover:underline"
                        >
                          {submission.proposalIds.length} proposal{submission.proposalIds.length === 1 ? '' : 's'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {submission.payoutAmount != null ? formatPoints(submission.payoutAmount) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {submission.canRequestReview ? (
                            <SmallButton disabled={busy} onClick={() => onRequestReview(submission.segmentInput)}>
                              {busy ? 'Requesting…' : 'Request review'}
                            </SmallButton>
                          ) : null}
                          {submission.needsPayoutRetry && submission.retrySubmissionLifecycleInput ? (
                            <SmallButton
                              disabled={busy}
                              onClick={() => onRetryMarkPaid(submission.retrySubmissionLifecycleInput!)}
                            >
                              {busy ? 'Retrying…' : 'Mark paid'}
                            </SmallButton>
                          ) : null}
                          {submission.canReviewAndPayout ? (
                            <SmallButton disabled={busy} onClick={() => onOpenReview(submission)}>
                              {reviews.length > 0 ? 'Review again' : 'Review'}
                            </SmallButton>
                          ) : reviews.length > 0 ? (
                            <SmallButton onClick={() => onOpenReview(submission)}>
                              Reviews ({reviews.length})
                            </SmallButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-bg">
                        <td colSpan={6} className="px-3 py-2">
                          <ul className="flex flex-col gap-1">
                            {submission.proposals.map(proposal => (
                              <li key={proposal.entityId} className="flex items-center justify-between gap-3">
                                <Link
                                  href={NavUtils.toProposal(proposal.spaceId, proposal.entityId)}
                                  className="min-w-0 truncate hover:underline"
                                >
                                  {proposal.name}
                                </Link>
                                <span className="shrink-0 text-grey-04">
                                  {proposal.status} · {proposal.createdAt.toLocaleDateString('en-US')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
