/**
 * Governance proposals list component.
 *
 * Fetches and displays proposals for a space using the new REST API.
 * Separates proposals into categories: executable, active, and completed.
 * Supports filtering by proposal type (content proposals vs membership requests).
 */
import React from 'react';

import { Effect, Either, Schema } from 'effect';
import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { proposalTimestampSeconds } from '~/core/governance/proposal-timestamp';
import { ORDERED_PROPOSALS_CACHE_SECONDS, governanceProposalsTag } from '~/core/governance/proposals-cache';
import { compareOpenProposals } from '~/core/governance/sort-open-proposals';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  convertVoteOption,
  encodePathSegment,
  findMembershipAction,
  isValidUUID,
  mapApiActionsToProposalType,
  mapProposalStatus,
  restFetch,
} from '~/core/io/rest';
import { defaultProfile, fetchProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import { fetchProposalSubmittedTimes, getSubmittedTime } from '~/core/io/subgraph/fetch-proposal-submitted-times';
import { filterGrantedMembershipRequests } from '~/core/io/subgraph/filter-granted-membership-requests';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import { getIsProposalEnded, getMembershipProposalDisplayName, getProposalName } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceOutcomeDate, GovernanceOutcomeTime } from './governance-outcome-timestamp';
import type { GovernanceProposalType } from './governance-proposal-type-filter';
import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceRejectedProposalMenu } from './governance-rejected-proposal-menu';
import { GovernanceStatusChip } from './governance-status-chip';
import { ProposalListItem } from './proposal-list-item';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type ProposalBucket = 'executable' | 'active' | 'completed';
const BUCKET_BASE_ORDER: Record<ProposalBucket, number> = {
  executable: 0,
  active: 10000,
  completed: 20000,
};

const PAGE_SIZE = 100;

/**
 * Unvoted proposals first; voted ones sink to the bottom (same as governance home review).
 * Then soonest-closing first, and newest submission first among proposals that close at
 * the same time.
 *
 * That last key is what orders the "Voting period open" group: their voting window is
 * unstamped until the first vote, so they all carry endTime 0 and used to tie — leaving
 * them in whatever order the API happened to return.
 */
function sortOpenProposalsUnvotedFirstByEndTimeAsc(
  items: readonly ApiProposalListItem[],
  submittedTimes: Map<string, number>
): ApiProposalListItem[] {
  const order = (p: ApiProposalListItem) => ({
    hasViewerVote: p.userVote != null,
    endTime: p.timing.endTime,
    submittedAt: getSubmittedTime(submittedTimes, p.proposalId),
  });
  return [...items].sort((a, b) => compareOpenProposals(order(a), order(b), { unvotedFirst: true, endTime: 'asc' }));
}

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

interface Props {
  spaceId: string;
  page: number;
  proposalType?: GovernanceProposalType;
}

export type GovernanceProposalsListResult = {
  node: React.ReactNode;
  hasMore: boolean;
};

export async function GovernanceProposalsList({
  spaceId,
  page,
  proposalType,
}: Props): Promise<GovernanceProposalsListResult> {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [result, profile, space] = await Promise.all([
    fetchGovernanceProposals({ spaceId, first: PAGE_SIZE, page, connectedAddress, proposalType }),
    connectedAddress ? Effect.runPromise(fetchProfile(connectedAddress)) : null,
    cachedFetchSpace(spaceId),
  ]);

  const { proposals, hasMore } = result;

  if (proposals.length === 0) {
    return {
      node: <p className="py-6 text-body text-grey-04">No proposals yet</p>,
      hasMore: false,
    };
  }

  const spaceName = space?.entity?.name ?? '';

  const bucketPositions: Record<ProposalBucket, number> = { executable: 0, active: 0, completed: 0 };

  return {
    node: (
      <div className="flex flex-col">
        {proposals.map(p => {
          const displayProfile = p.targetProfile ?? p.createdBy;
          const timestampSeconds = proposalTimestampSeconds({
            status: p.status,
            endTime: p.endTime,
            startTime: p.startTime,
            submittedAt: p.createdAt,
          });
          const proposalTitle = p.targetProfile
            ? getMembershipProposalDisplayName(p.type, p.targetProfile)
            : getProposalName({
                ...p,
                name: p.name ?? p.id,
                space: {
                  id: spaceId,
                  name: spaceName,
                  image: space?.entity?.image ?? '',
                },
              });

          const showReopenMenu =
            p.status === 'REJECTED' && p.type === 'ADD_EDIT' && getIsProposalEnded(p.status, p.endTime);

          const baseOrder = BUCKET_BASE_ORDER[p.bucket] + bucketPositions[p.bucket]++;

          return (
            <ProposalListItem key={p.id} proposalId={p.id} baseOrder={baseOrder} canSink={p.bucket !== 'completed'}>
              <div className="relative flex w-full flex-col gap-3 py-4">
                <Link
                  href={`/space/${spaceId}/governance?proposalId=${p.id}`}
                  className="absolute inset-0"
                  aria-label={proposalTitle}
                />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 flex-1 text-smallTitle">{proposalTitle}</h3>
                    {showReopenMenu ? (
                      <div className="relative z-10">
                        <GovernanceRejectedProposalMenu proposalId={p.id} spaceId={spaceId} />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-breadcrumb text-grey-04">
                    {displayProfile.profileLink ? (
                      <Link
                        href={displayProfile.profileLink}
                        className="relative z-10 flex min-w-0 items-center gap-2 transition-colors duration-75 hover:text-text"
                      >
                        <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                          <Avatar
                            avatarUrl={displayProfile.avatarUrl}
                            value={displayProfile.address ?? displayProfile.id}
                          />
                        </div>
                        <p className="min-w-0">{displayProfile.name ?? displayProfile.address ?? displayProfile.id}</p>
                      </Link>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                          <Avatar
                            avatarUrl={displayProfile.avatarUrl}
                            value={displayProfile.address ?? displayProfile.id}
                          />
                        </div>
                        <p className="min-w-0">{displayProfile.name ?? displayProfile.address ?? displayProfile.id}</p>
                      </div>
                    )}
                    {timestampSeconds > 0 && (
                      <>
                        <span aria-hidden className="shrink-0 select-none">
                          ·
                        </span>
                        <GovernanceOutcomeDate geoTimeSeconds={timestampSeconds} className="shrink-0" />
                        <span aria-hidden className="shrink-0 select-none">
                          ·
                        </span>
                        <GovernanceOutcomeTime geoTimeSeconds={timestampSeconds} className="shrink-0 tabular-nums" />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="inline-flex min-w-0 flex-3 items-center gap-8">
                    <GovernanceProposalVoteState
                      variant="space"
                      yesPercentage={percentageFromCounts(p.proposalVotes.yesCount, p.proposalVotes.totalCount)}
                      noPercentage={percentageFromCounts(p.proposalVotes.noCount, p.proposalVotes.totalCount)}
                      userVote={p.userVote}
                      user={
                        profile || connectedAddress
                          ? {
                              address: connectedAddress,
                              avatarUrl: profile?.avatarUrl ?? null,
                            }
                          : undefined
                      }
                    />
                  </div>

                  <GovernanceStatusChip
                    endTime={p.endTime}
                    status={p.status}
                    canExecute={p.canExecute}
                    spaceId={spaceId}
                    proposalId={p.id}
                  />
                </div>
              </div>
            </ProposalListItem>
          );
        })}
      </div>
    ),
    hasMore,
  };
}

export interface FetchActiveProposalsOptions {
  spaceId: string;
  page?: number;
  first?: number;
}

// ============================================================================
// Internal Types
// ============================================================================

type GovernanceProposal = {
  id: string;
  name: string | null;
  type: ProposalType;
  createdBy: Profile;
  targetProfile?: Profile;
  createdAt: number;
  createdAtBlock: string;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  canExecute: boolean;
  bucket: ProposalBucket;
  proposalVotes: {
    totalCount: number;
    yesCount: number;
    noCount: number;
  };
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
};

function apiProposalToGovernanceDto(
  proposal: ApiProposalListItem,
  bucket: ProposalBucket,
  submittedAt: number,
  maybeProfile?: Profile,
  maybeTargetProfile?: Profile
): GovernanceProposal {
  const profile = maybeProfile ?? defaultProfile(proposal.proposedBy, proposal.proposedBy);

  // Walks all actions rather than reading actions[0] — REST action order isn't
  // guaranteed, so a multi-action proposal that contains a PUBLISH would be
  // misclassified if PUBLISH happens to be at a later index.
  const proposalType = mapApiActionsToProposalType(proposal.actions);

  return {
    id: proposal.proposalId,
    name: proposal.name,
    type: proposalType,
    createdAt: submittedAt,
    createdAtBlock: '0',
    startTime: proposal.timing.startTime,
    endTime: proposal.timing.endTime,
    status: mapProposalStatus(proposal.status),
    canExecute: proposal.canExecute,
    bucket,
    createdBy: profile,
    targetProfile: maybeTargetProfile,
    userVote: proposal.userVote ? convertVoteOption(proposal.userVote) : undefined,
    proposalVotes: {
      totalCount: proposal.votes.total,
      yesCount: proposal.votes.yes,
      noCount: proposal.votes.no,
    },
  };
}

function getProposalBucket(apiStatus: ApiProposalListItem['status']): ProposalBucket {
  switch (apiStatus) {
    case 'EXECUTABLE':
      return 'executable';
    case 'PROPOSED':
      return 'active';
    case 'ACCEPTED':
    case 'REJECTED':
      return 'completed';
  }
}

/**
 * Fetch proposals by status using server-side filtering.
 * Returns proposals filtered and sorted by the API.
 */
async function fetchProposalsByStatus({
  spaceId,
  connectedAddress,
  statuses,
  limit,
  orderBy = 'end_time',
  orderDirection = 'asc',
}: {
  spaceId: string;
  connectedAddress: string | undefined;
  statuses: string[];
  limit: number;
  orderBy?: 'created_at' | 'end_time' | 'start_time';
  orderDirection?: 'asc' | 'desc';
}): Promise<readonly ApiProposalListItem[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('status', statuses.join(','));
  params.set('orderBy', orderBy);
  params.set('orderDirection', orderDirection);

  // If we have the user's address, pass it to get their votes
  if (connectedAddress && isValidUUID(connectedAddress)) {
    params.set('voterId', connectedAddress);
  }

  const path = `/proposals/space/${encodePathSegment(spaceId)}/status?${params.toString()}`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`Failed to fetch proposals for space ${spaceId}:`, result.left);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposals for space ${spaceId}:`, decoded.left);
    return [];
  }

  return decoded.right.proposals;
}

/**
 * A space's whole proposal list, ordered, before any type filter is applied.
 */
function loadOrderedProposals(spaceId: string, connectedAddress: string | undefined) {
  return unstable_cache(
    async () => {
      const [executableProposals, activeProposals, completedProposals] = await Promise.all([
        fetchProposalsByStatus({
          spaceId,
          connectedAddress,
          statuses: ['EXECUTABLE'],
          limit: 100,
          orderBy: 'end_time',
          orderDirection: 'asc',
        }),
        fetchProposalsByStatus({
          spaceId,
          connectedAddress,
          statuses: ['PROPOSED'],
          limit: 100,
          orderBy: 'end_time',
          orderDirection: 'asc',
        }),
        fetchProposalsByStatus({
          spaceId,
          connectedAddress,
          statuses: ['ACCEPTED', 'REJECTED'],
          limit: 100,
          orderBy: 'end_time',
          orderDirection: 'desc',
        }),
      ]);

      // Requests whose target already belongs to the space (a duplicate request was
      // accepted, or they were added another way) stay PROPOSED/EXECUTABLE forever —
      // drop them from the open buckets. Completed history stays intact.
      const openProposals = await filterGrantedMembershipRequests([...executableProposals, ...activeProposals]);

      // Sort needs a submission time for every open proposal; completed ones get theirs
      // later, only for the page being rendered.
      const submittedTimes = await fetchProposalSubmittedTimes(openProposals.map(p => p.proposalId));

      // Combine in priority order: executable > active > completed; within open phases, unvoted first.
      const ordered = [
        ...sortOpenProposalsUnvotedFirstByEndTimeAsc(
          openProposals.filter(p => p.status === 'EXECUTABLE'),
          submittedTimes
        ),
        ...sortOpenProposalsUnvotedFirstByEndTimeAsc(
          openProposals.filter(p => p.status !== 'EXECUTABLE'),
          submittedTimes
        ),
        ...completedProposals,
      ];

      // The rendered rows need these times too, so recomputing them outside would undo the saving.
      return { ordered, submittedTimes: [...submittedTimes] };
    },
    ['governance-ordered-proposals', spaceId, connectedAddress ?? 'anonymous'],
    { revalidate: ORDERED_PROPOSALS_CACHE_SECONDS, tags: [governanceProposalsTag(spaceId)] }
  )();
}

type FetchGovernanceProposalsResult = {
  proposals: GovernanceProposal[];
  hasMore: boolean;
};

async function fetchGovernanceProposals({
  spaceId,
  connectedAddress,
  first = PAGE_SIZE,
  page = 0,
  proposalType,
}: {
  spaceId: string;
  first: number;
  page: number;
  connectedAddress: string | undefined;
  proposalType?: GovernanceProposalType;
}): Promise<FetchGovernanceProposalsResult> {
  const effectiveType = proposalType ?? 'all';

  const { ordered, submittedTimes: submittedTimeEntries } = await loadOrderedProposals(spaceId, connectedAddress);
  const submittedTimes = new Map(submittedTimeEntries);

  let combinedProposals = [...ordered];

  // Filter by proposal type
  if (effectiveType === 'proposals') {
    combinedProposals = combinedProposals.filter(p => findMembershipAction(p.actions) === undefined);
  } else if (effectiveType === 'requests') {
    combinedProposals = combinedProposals.filter(p => findMembershipAction(p.actions) !== undefined);
  }

  // Apply pagination
  const startIndex = page * first;
  const endIndex = startIndex + first;
  const paginatedProposals = combinedProposals.slice(startIndex, endIndex);

  // Check if there are more items beyond this page
  const hasMore = combinedProposals.length > endIndex;

  // The cached pass covers open proposals, which need a time to sort. Completed ones need one only
  // to render, so they are resolved here for the page rather than for the whole history.
  const missingTimeIds = paginatedProposals
    .map(p => p.proposalId)
    .filter(proposalId => getSubmittedTime(submittedTimes, proposalId) === 0);

  if (missingTimeIds.length > 0) {
    for (const [id, seconds] of await fetchProposalSubmittedTimes(missingTimeIds)) {
      submittedTimes.set(id, seconds);
    }
  }

  // Fetch profiles for creators
  const proposedByIds = paginatedProposals.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];

  // Fetch target profiles for membership proposals (extract targetId from actions)
  const targetIds = paginatedProposals
    .map(p => findMembershipAction(p.actions)?.targetId)
    .filter((id): id is string => !!id);
  const uniqueTargetIds = [...new Set(targetIds)];

  const [profilesForProposals, profilesForTargets] = await Promise.all([
    Effect.runPromise(fetchProfilesBySpaceIds(uniqueProposedByIds)),
    uniqueTargetIds.length > 0 ? Effect.runPromise(fetchProfilesBySpaceIds(uniqueTargetIds)) : [],
  ]);

  // Create maps for efficient lookup
  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));
  const targetProfilesBySpaceId = new Map(uniqueTargetIds.map((id, i) => [id, profilesForTargets[i]]));

  const proposals = paginatedProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    const targetId = findMembershipAction(p.actions)?.targetId;
    const maybeTargetProfile = targetId ? targetProfilesBySpaceId.get(targetId) : undefined;
    return apiProposalToGovernanceDto(
      p,
      getProposalBucket(p.status),
      getSubmittedTime(submittedTimes, p.proposalId),
      maybeProfile,
      maybeTargetProfile
    );
  });

  return { proposals, hasMore };
}
