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
  type ApiProposalStatusResponse,
} from '~/core/io/rest';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import { getProposalName, getYesVotePercentage } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
  page: number;
}

export async function GovernanceProposalsList({ spaceId, page }: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [proposals, profile, space] = await Promise.all([
    fetchGovernanceProposals({ spaceId, first: 5, page, connectedAddress }),
    connectedAddress ? Effect.runPromise(fetchProfile(connectedAddress)) : null,
    cachedFetchSpace(spaceId),
  ]);

  const userVotesByProposalId = proposals.reduce((acc, p) => {
    if (p.userVotes.length === 0) return acc;

    return acc.set(p.id, p.userVotes[0].vote);
  }, new Map<string, SubstreamVote['vote']>());

  return (
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
                  votes={{
                    totalCount: p.proposalVotes.totalCount,
                    votes: p.proposalVotes.votes,
                  }}
                  userVote={userVotesByProposalId.get(p.id)}
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
                yesPercentage={getYesVotePercentage(p.proposalVotes.votes, p.proposalVotes.totalCount)}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
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
    votes: SubstreamVote[];
  };
  userVotes: SubstreamVote[];
};

function apiProposalToGovernanceDto(
  proposal: ApiProposalStatusResponse,
  connectedAddress: string | undefined,
  maybeProfile?: Profile
): GovernanceProposal {
  const profile = maybeProfile ?? defaultProfile(proposal.proposedBy, proposal.proposedBy);

  // Get proposal name from actions
  const firstAction = proposal.actions[0];
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  // Convert API votes to internal format
  const votes: SubstreamVote[] = proposal.votes.voters.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  // Build user votes from the API's userVote field
  // Use the connected user's address as the accountId (since we passed voterId to the API)
  const userVotes: SubstreamVote[] = proposal.userVote && connectedAddress
    ? [
        {
          vote: convertVoteOption(proposal.userVote),
          accountId: Address(connectedAddress),
        },
      ]
    : [];

  return {
    id: proposal.proposalId,
    name: proposal.name,
    type: proposalType,
    createdAt: proposal.timing.startTime, // Use startTime as createdAt approximation
    createdAtBlock: '0',
    startTime: proposal.timing.startTime,
    endTime: proposal.timing.endTime,
    status: mapProposalStatus(proposal.status),
    createdBy: profile,
    userVotes,
    proposalVotes: {
      totalCount: proposal.votes.total,
      votes,
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
}): Promise<readonly ApiProposalStatusResponse[]> {
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
}): Promise<GovernanceProposal[]> {
  // We fetch proposals from each status category and combine them in priority order.
  // To handle pagination across combined results, we fetch enough from each category
  // to cover all items up to the requested page. This may over-fetch when one category
  // dominates, but ensures correctness. A future optimization could use cursor-based
  // pagination per category with cached cursors.
  const itemsNeeded = (page + 1) * first;
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
  const paginatedProposals = allProposals.slice(startIndex, startIndex + first);

  // Fetch profiles for creators
  const proposedByIds = paginatedProposals.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueProposedByIds));

  // Create a map of memberSpaceId -> profile for efficient lookup
  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));

  return paginatedProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return apiProposalToGovernanceDto(p, connectedAddress, maybeProfile);
  });
}
