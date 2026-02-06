/**
 * Governance proposals list component.
 *
 * Fetches and displays proposals for a space using the new REST API.
 * Separates proposals into categories: executable, active, and completed.
 */
import { Effect, Either, Schema } from 'effect';
import { cookies } from 'next/headers';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchProfile, fetchProfilesBySpaceIds, defaultProfile } from '~/core/io/subgraph';
import {
  restFetch,
  ApiProposalListResponseSchema,
  mapActionTypeToProposalType,
  mapProposalStatus,
  convertVoteOption,
  encodePathSegment,
  validateActionTypes,
  isValidUUID,
  type ApiProposalListItem,
} from '~/core/io/rest';
import { ProposalStatus, ProposalType } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import { getProposalName } from '~/core/utils/utils';

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
  page: number;
}

export type GovernanceProposalsListResult = {
  node: React.ReactNode;
  hasMore: boolean;
};

export async function GovernanceProposalsList({ spaceId, page }: Props): Promise<GovernanceProposalsListResult> {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [result, profile, space] = await Promise.all([
    fetchGovernanceProposals({ spaceId, first: 5, page, connectedAddress }),
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

  return {
    node: (
      <div className="flex flex-col divide-y divide-grey-01">
        {proposals.map(p => {
          return (
            <Link
              key={p.id}
              href={`/space/${spaceId}/governance?proposalId=${p.id}`}
              className="flex w-full flex-col gap-4 py-6"
            >
              <div className="flex flex-col gap-2">
                <h3 className="text-smallTitle">
                  {getProposalName({
                    ...p,
                    name: p.name ?? p.id,
                    space: {
                      id: spaceId,
                      name: space?.entity?.name ?? '',
                      image: space?.entity?.image ?? '',
                    },
                  })}
                </h3>
                <div className="flex items-center gap-2 text-breadcrumb text-grey-04">
                  <div className="relative h-3 w-3 overflow-hidden rounded-full">
                    <Avatar avatarUrl={p.createdBy.avatarUrl} value={p.createdBy.address} />
                  </div>
                  <p>{p.createdBy.name ?? p.createdBy.id}</p>
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
                  yesPercentage={percentageFromCounts(p.proposalVotes.yesCount, p.proposalVotes.totalCount)}
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
  createdAt: number;
  createdAtBlock: string;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    yesCount: number;
    noCount: number;
  };
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
};

function apiProposalToGovernanceDto(
  proposal: ApiProposalListItem,
  maybeProfile?: Profile
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
    createdBy: profile,
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

  // Exclude membership proposals
  const excludeTypes = validateActionTypes(['AddMember', 'RemoveMember', 'AddEditor', 'RemoveEditor']);
  params.set('excludeActionTypes', excludeTypes.join(','));

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
 * Fetch governance proposals for a space using the new REST API.
 *
 * Excludes membership proposals (ADD_MEMBER, REMOVE_MEMBER, ADD_EDITOR, REMOVE_EDITOR)
 * which are shown in the home feed instead.
 *
 * Uses server-side status filtering to fetch proposals in priority order:
 * 1. EXECUTABLE - proposals ready to execute (sorted by end_time asc, oldest first)
 * 2. PROPOSED - active voting proposals (sorted by end_time asc, ending soonest first)
 * 3. ACCEPTED/REJECTED - completed proposals (sorted by end_time desc, most recent first)
 */
type FetchGovernanceProposalsResult = {
  proposals: GovernanceProposal[];
  hasMore: boolean;
};

async function fetchGovernanceProposals({
  spaceId,
  connectedAddress,
  first = 5,
  page = 0,
}: {
  spaceId: string;
  first: number;
  page: number;
  connectedAddress: string | undefined;
}): Promise<FetchGovernanceProposalsResult> {
  // We fetch proposals from each status category and combine them in priority order.
  // To handle pagination across combined results, we fetch enough from each category
  // to cover all items up to the requested page. This may over-fetch when one category
  // dominates, but ensures correctness. A future optimization could use cursor-based
  // pagination per category with cached cursors.
  //
  // We fetch one extra item to determine if there are more results.
  const itemsNeeded = (page + 1) * first + 1;
  const [executableProposals, activeProposals, completedProposals] = await Promise.all([
    // Executable proposals: ready to execute, oldest first
    fetchProposalsByStatus({
      spaceId,
      connectedAddress,
      statuses: ['EXECUTABLE'],
      limit: itemsNeeded,
      orderBy: 'end_time',
      orderDirection: 'asc',
    }),
    // Active proposals: currently voting, ending soonest first
    fetchProposalsByStatus({
      spaceId,
      connectedAddress,
      statuses: ['PROPOSED'],
      limit: itemsNeeded,
      orderBy: 'end_time',
      orderDirection: 'asc',
    }),
    // Completed proposals: accepted/rejected, most recent first
    fetchProposalsByStatus({
      spaceId,
      connectedAddress,
      statuses: ['ACCEPTED', 'REJECTED'],
      limit: itemsNeeded,
      orderBy: 'end_time',
      orderDirection: 'desc',
    }),
  ]);

  // Combine in priority order: executable > active > completed
  const allProposals = [...executableProposals, ...activeProposals, ...completedProposals];

  // Apply pagination
  const startIndex = page * first;
  const endIndex = startIndex + first;
  const paginatedProposals = allProposals.slice(startIndex, endIndex);
  
  // Check if there are more items beyond this page
  const hasMore = allProposals.length > endIndex;

  // Fetch profiles for creators
  const proposedByIds = paginatedProposals.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueProposedByIds));

  // Create a map of memberSpaceId -> profile for efficient lookup
  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));

  const proposals = paginatedProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return apiProposalToGovernanceDto(p, maybeProfile);
  });

  return { proposals, hasMore };
}
