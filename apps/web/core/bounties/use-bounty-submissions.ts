'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities } from '~/core/io/queries';

import { type SubmissionLifecycleRecord, getSubmissionLifecycle } from './api';
import { CURATOR_API_BASE_URL } from './config';
import type { BountyDetail } from './fetch-bounty-detail';
import { fetchBountyReviews, fetchPayoutItems, fetchProposalStatuses, fetchSubmissionItems } from './fetch-submissions';
import { type GroupedSubmission, groupSubmissions } from './group-submissions';
import { bountyQueryKeys } from './use-bounties';
import type { BountyRoles } from './use-bounty-roles';

export const submissionsQueryKey = (spaceId: string, bountyId: string) =>
  [...bountyQueryKeys.all, 'submissions', spaceId, bountyId] as const;
export const lifecycleQueryKey = (spaceId: string, bountyId: string) =>
  [...bountyQueryKeys.all, 'lifecycle', spaceId, bountyId] as const;

/**
 * Everything the submissions/payouts sections need for one bounty. The KG
 * reads (submissions, payouts, reviews, proposal statuses) and the
 * curator-backend lifecycle read are separate queries so a backend outage
 * degrades to "every row in-progress" instead of hiding the KG data — the
 * same degradation curator-app ships.
 */
export function useBountySubmissions(detail: BountyDetail | null | undefined, roles: BountyRoles) {
  const spaceId = detail?.bounty.spaceId ?? '';
  const bountyId = detail?.bounty.id ?? '';
  const submissionLinks = detail?.submissions ?? [];

  const graph = useQuery({
    queryKey: [
      ...submissionsQueryKey(spaceId, bountyId),
      submissionLinks
        .map(l => l.id)
        .sort()
        .join(','),
    ],
    enabled: !!detail,
    staleTime: 15_000,
    queryFn: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const [submissions, payoutsRaw] = yield* Effect.all(
            [fetchSubmissionItems(submissionLinks, spaceId), fetchPayoutItems(bountyId)],
            { concurrency: 2 }
          );
          const recipientIds = [...new Set(payoutsRaw.map(p => p.recipientEntityId))];
          const [recipients, proposalStatuses, reviews] = yield* Effect.all(
            [
              recipientIds.length > 0 ? getBatchEntities(recipientIds) : Effect.succeed([]),
              fetchProposalStatuses(submissions.map(s => s.entityId)),
              fetchBountyReviews(submissions.map(s => s.entityId)),
            ],
            { concurrency: 3 }
          );
          const recipientNames = new Map(recipients.map(entity => [uuidToHex(entity.id), entity.name]));
          const payouts = payoutsRaw.map(p => ({
            ...p,
            recipientName: recipientNames.get(p.recipientEntityId) ?? null,
          }));
          return { submissions, payouts, proposalStatuses, reviews };
        })
      ),
  });

  const lifecycle = useQuery<SubmissionLifecycleRecord[]>({
    queryKey: lifecycleQueryKey(spaceId, bountyId),
    enabled: !!detail && !!CURATOR_API_BASE_URL,
    staleTime: 15_000,
    retry: 1,
    queryFn: async () => (await getSubmissionLifecycle(spaceId, bountyId)).submissions,
  });

  const grouped: GroupedSubmission[] = React.useMemo(() => {
    if (!detail || !graph.data) return [];
    return groupSubmissions({
      bountyId: detail.bounty.id,
      submissions: graph.data.submissions,
      payoutItems: graph.data.payouts,
      proposalStatuses: graph.data.proposalStatuses,
      lifecycleRecords: lifecycle.data ?? [],
      currentUserEntityId: roles.personId ?? roles.personalSpaceId,
      isSpaceEditor: roles.isEditor,
    });
  }, [detail, graph.data, lifecycle.data, roles.isEditor, roles.personId, roles.personalSpaceId]);

  return {
    grouped,
    payouts: graph.data?.payouts ?? [],
    reviews: graph.data?.reviews ?? [],
    isLoading: graph.isLoading,
    isError: graph.isError,
    /** True when the lifecycle read failed — statuses shown are the KG-only degradation. */
    lifecycleUnavailable: lifecycle.isError,
    refetch: () => Promise.all([graph.refetch(), lifecycle.refetch()]),
  };
}
