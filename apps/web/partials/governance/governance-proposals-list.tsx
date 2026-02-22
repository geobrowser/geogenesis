/**
 * Governance proposals list component.
 *
 * Fetches and displays proposals for a space using the new REST API.
 * Separates proposals into categories: executable, active, and completed.
 * Supports filtering by proposal type (content proposals vs membership requests).
 */
import { Effect, Either, Schema } from 'effect';
import { cookies } from 'next/headers';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  convertVoteOption,
  encodePathSegment,
  isValidUUID,
  mapActionTypeToProposalType,
  mapProposalStatus,
  restFetch,
} from '~/core/io/rest';
import { defaultProfile, fetchProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import { getProposalName } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import type { GovernanceProposalType } from './governance-proposal-type-filter';
import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

const PAGE_SIZE = 100;

const MEMBERSHIP_ACTION_TYPES = new Set(['ADD_MEMBER', 'REMOVE_MEMBER', 'ADD_EDITOR', 'REMOVE_EDITOR']);

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

function getMembershipProposalDisplayName(type: ProposalType, targetProfile: Profile): string {
  const targetName = targetProfile.name ?? targetProfile.address ?? targetProfile.id;
  switch (type) {
    case 'ADD_MEMBER':
      return `Add ${targetName} as member`;
    case 'REMOVE_MEMBER':
      return `Remove ${targetName} as member`;
    case 'ADD_EDITOR':
      return `Add ${targetName} as editor`;
    case 'REMOVE_EDITOR':
      return `Remove ${targetName} as editor`;
    default:
      return targetName;
  }
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

  return {
    node: (
      <div className="flex flex-col divide-y divide-grey-01">
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

          return (
            <Link
              key={p.id}
              href={`/space/${spaceId}/governance?proposalId=${p.id}`}
              className="flex w-full flex-col gap-4 py-6"
            >
              <div className="flex flex-col gap-2">
                <h3 className="text-smallTitle">{proposalTitle}</h3>
                <div className="flex items-center gap-2 text-breadcrumb text-grey-04">
                  <div className="relative h-3 w-3 overflow-hidden rounded-full">
                    <Avatar avatarUrl={displayProfile.avatarUrl} value={displayProfile.address ?? displayProfile.id} />
                  </div>
                  <p>{displayProfile.name ?? displayProfile.address ?? displayProfile.id}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="inline-flex flex-[3] items-center gap-8">
                  <GovernanceProposalVoteState
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
                />
              </div>
            </Link>
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
  proposalVotes: {
    totalCount: number;
    yesCount: number;
    noCount: number;
  };
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
};

function apiProposalToGovernanceDto(
  proposal: ApiProposalListItem,
  maybeProfile?: Profile,
  maybeTargetProfile?: Profile
): GovernanceProposal {
  const profile = maybeProfile ?? defaultProfile(proposal.proposedBy, proposal.proposedBy);

  const firstAction = proposal.actions[0];
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

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
  const effectiveType = proposalType ?? 'proposals';

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

  // Combine in priority order: executable > active > completed
  let combinedProposals = [...executableProposals, ...activeProposals, ...completedProposals];

  // Filter by proposal type
  if (effectiveType === 'proposals') {
    combinedProposals = combinedProposals.filter(p => !MEMBERSHIP_ACTION_TYPES.has(p.actions[0]?.actionType ?? ''));
  } else if (effectiveType === 'requests') {
    combinedProposals = combinedProposals.filter(p => MEMBERSHIP_ACTION_TYPES.has(p.actions[0]?.actionType ?? ''));
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
    .filter(p => MEMBERSHIP_ACTION_TYPES.has(p.actions[0]?.actionType ?? ''))
    .map(p => p.actions[0]?.targetId)
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
    const targetId = p.actions[0]?.targetId;
    const maybeTargetProfile = targetId ? targetProfilesBySpaceId.get(targetId) : undefined;
    return apiProposalToGovernanceDto(p, maybeProfile, maybeTargetProfile);
  });

  return { proposals, hasMore };
}
