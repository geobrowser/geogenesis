/**
 * Fetches and displays proposals for a space using the REST API.
 * Supports category (knowledge / membership / settings) and status
 * (pending / accepted / rejected) filters matching governance home.
 */
import React from 'react';

import { Effect } from 'effect';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import {
  type ApiProposalListItem,
  convertVoteOption,
  findMembershipAction,
  mapApiActionsToProposalType,
  mapProposalStatus,
} from '~/core/io/rest';
import { defaultProfile, fetchProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import { filterGrantedMembershipRequests } from '~/core/io/subgraph/filter-granted-membership-requests';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import {
  formatGovernanceOutcomeDate,
  formatGovernanceOutcomeTime,
  getIsProposalEnded,
  getMembershipProposalDisplayName,
  getProposalName,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import {
  type GovernanceProposalCategory,
  type GovernanceProposalStatusFilter,
  fetchProposalsForSpaceByGovernanceFilters,
} from './governance-proposal-query';
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

/** Unvoted proposals first; voted ones sink to the bottom (same as governance home review). */
function sortOpenProposalsUnvotedFirstByEndTimeAsc(items: readonly ApiProposalListItem[]): ApiProposalListItem[] {
  return [...items].sort((a, b) => {
    const aVoted = a.userVote != null;
    const bVoted = b.userVote != null;
    if (aVoted !== bVoted) return aVoted ? 1 : -1;
    return a.timing.endTime - b.timing.endTime;
  });
}

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

interface Props {
  spaceId: string;
  page: number;
  category?: GovernanceProposalCategory;
  status?: GovernanceProposalStatusFilter;
}

export type GovernanceProposalsListResult = {
  node: React.ReactNode;
  hasMore: boolean;
};

export async function GovernanceProposalsList({
  spaceId,
  page,
  category = 'all',
  status = 'pending',
}: Props): Promise<GovernanceProposalsListResult> {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const profile = connectedAddress ? await Effect.runPromise(fetchProfile(connectedAddress)) : null;
  const [result, space] = await Promise.all([
    fetchGovernanceProposals({
      spaceId,
      first: PAGE_SIZE,
      page,
      memberSpaceId: profile?.spaceId,
      category,
      status,
    }),
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
                    {(p.status === 'ACCEPTED' || p.status === 'REJECTED') && (
                      <>
                        <span aria-hidden className="shrink-0 select-none">
                          ·
                        </span>
                        <span className="shrink-0">{formatGovernanceOutcomeDate(p.endTime)}</span>
                        <span aria-hidden className="shrink-0 select-none">
                          ·
                        </span>
                        <time className="shrink-0 tabular-nums" dateTime={new Date(p.endTime * 1000).toISOString()}>
                          {formatGovernanceOutcomeTime(p.endTime)}
                        </time>
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
    createdAt: proposal.timing.startTime,
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
 * Fetch proposals filtered by category and status (same REST query as governance home).
 */
type FetchGovernanceProposalsResult = {
  proposals: GovernanceProposal[];
  hasMore: boolean;
};

async function fetchGovernanceProposals({
  spaceId,
  memberSpaceId,
  first = PAGE_SIZE,
  page = 0,
  category = 'all',
  status = 'pending',
}: {
  spaceId: string;
  first: number;
  page: number;
  memberSpaceId: string | undefined;
  category?: GovernanceProposalCategory;
  status?: GovernanceProposalStatusFilter;
}): Promise<FetchGovernanceProposalsResult> {
  let combinedProposals = [
    ...(await fetchProposalsForSpaceByGovernanceFilters({
      spaceId,
      memberSpaceId: memberSpaceId ?? '',
      category,
      status,
    })),
  ];

  // Requests whose target already belongs to the space stay PROPOSED/EXECUTABLE forever —
  // drop them from open (pending) buckets. Completed history stays intact.
  if (status === 'pending') {
    combinedProposals = await filterGrantedMembershipRequests(combinedProposals);
    combinedProposals = [
      ...sortOpenProposalsUnvotedFirstByEndTimeAsc(combinedProposals.filter(p => p.status === 'EXECUTABLE')),
      ...sortOpenProposalsUnvotedFirstByEndTimeAsc(combinedProposals.filter(p => p.status !== 'EXECUTABLE')),
    ];
  }

  // Apply pagination
  const startIndex = page * first;
  const endIndex = startIndex + first;
  const paginatedProposals = combinedProposals.slice(startIndex, endIndex);

  // Check if there are more items beyond this page
  const hasMore = combinedProposals.length > endIndex;

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
    return apiProposalToGovernanceDto(p, getProposalBucket(p.status), maybeProfile, maybeTargetProfile);
  });

  return { proposals, hasMore };
}
