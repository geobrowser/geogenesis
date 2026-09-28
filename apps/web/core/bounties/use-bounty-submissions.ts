'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities, getSpaces } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';

import type { BountyDetail } from './fetch-bounty-detail';
import { fetchBountyReviews, fetchPayoutItems, fetchProposalStatuses, fetchSubmissionItems } from './fetch-submissions';
import { type GroupedSubmission, filterReviewsByAuthorizedSpaces, groupSubmissions } from './group-submissions';
import { bountyQueryKeys } from './use-bounties';
import type { BountyRoles } from './use-bounty-roles';

export const submissionsQueryKey = (spaceId: string, bountyId: string) =>
  [...bountyQueryKeys.all, 'submissions', spaceId, bountyId] as const;

/**
 * Everything the submissions/payouts sections need for one bounty, read from
 * the knowledge graph in one query bundle: submission links → proposals,
 * payouts (Payout Bounty backlinks), reviews (Proposals backlinks), and
 * best-effort proposal governance statuses.
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
          const [submissions, payoutsRaw, bountySpaces] = yield* Effect.all(
            [
              fetchSubmissionItems(submissionLinks, spaceId),
              // Payouts are authored by editors INTO the bounty's space; rows
              // published anywhere else are not authoritative.
              fetchPayoutItems(bountyId, spaceId),
              getSpaces({ spaceIds: [spaceId] }),
            ],
            { concurrency: 3 }
          );
          const editorSpaceIds = bountySpaces[0]?.editors ?? [];
          const recipientIds = [...new Set(payoutsRaw.map(p => p.recipientEntityId))];
          // Recipients are personal-space system entities (or legacy person entities).
          // A space entity's own name is just "Space <uuid>", so resolve the space's
          // profile first — that is what a reader expects to see — and only fall back
          // to the entity name for legacy person-entity recipients.
          const [recipients, recipientProfiles, proposalStatuses, reviews] = yield* Effect.all(
            [
              recipientIds.length > 0 ? getBatchEntities(recipientIds) : Effect.succeed([]),
              recipientIds.length > 0 ? fetchProfilesBySpaceIds(recipientIds) : Effect.succeed([]),
              fetchProposalStatuses(submissions.map(s => s.entityId)),
              fetchBountyReviews(submissions.map(s => s.entityId)).pipe(
                Effect.map(rows => filterReviewsByAuthorizedSpaces(rows, editorSpaceIds))
              ),
            ],
            { concurrency: 4 }
          );
          const entityNames = new Map(recipients.map(entity => [uuidToHex(entity.id), entity.name]));
          const profileNames = new Map<string, string>();
          recipientProfiles.forEach((profile, index) => {
            const name = profile?.name?.trim();
            if (name) profileNames.set(uuidToHex(recipientIds[index]), name);
          });
          const payouts = payoutsRaw.map(p => {
            const profileName = profileNames.get(p.recipientEntityId);
            return {
              ...p,
              recipientName: profileName ?? entityNames.get(p.recipientEntityId) ?? null,
              recipientIsSpace: profileName != null,
            };
          });
          return { submissions, payouts, proposalStatuses, reviews };
        })
      ),
  });

  const grouped: GroupedSubmission[] = React.useMemo(() => {
    if (!detail || !graph.data) return [];
    return groupSubmissions({
      bountyId: detail.bounty.id,
      submissions: graph.data.submissions,
      payoutItems: graph.data.payouts,
      proposalStatuses: graph.data.proposalStatuses,
      reviews: graph.data.reviews,
      isSpaceEditor: roles.isEditor,
    });
  }, [detail, graph.data, roles.isEditor]);

  return {
    grouped,
    payouts: graph.data?.payouts ?? [],
    reviews: graph.data?.reviews ?? [],
    isLoading: graph.isLoading,
    isError: graph.isError,
    refetch: () => graph.refetch(),
  };
}
