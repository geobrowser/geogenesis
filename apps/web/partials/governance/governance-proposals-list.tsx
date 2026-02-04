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
import { fetchProfile, fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import { restFetch } from '~/core/io/rest';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '~/core/io/substream-schema';
import { Profile } from '~/core/types';
import { getProposalName, getYesVotePercentage } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

// ============================================================================
// Effect Schema Definitions for API Response Validation
// ============================================================================

/**
 * Schema for API vote option.
 */
const ApiVoteOptionSchema = Schema.Union(
  Schema.Literal('YES'),
  Schema.Literal('NO'),
  Schema.Literal('ABSTAIN')
);

type ApiVoteOption = Schema.Schema.Type<typeof ApiVoteOptionSchema>;

/**
 * Schema for API vote.
 */
const ApiVoteSchema = Schema.Struct({
  voterId: Schema.String,
  vote: ApiVoteOptionSchema,
});

/**
 * Schema for API action type.
 */
const ApiActionTypeSchema = Schema.Union(
  Schema.Literal('ADD_MEMBER'),
  Schema.Literal('REMOVE_MEMBER'),
  Schema.Literal('ADD_EDITOR'),
  Schema.Literal('REMOVE_EDITOR'),
  Schema.Literal('UNFLAG_EDITOR'),
  Schema.Literal('PUBLISH'),
  Schema.Literal('FLAG'),
  Schema.Literal('UNFLAG'),
  Schema.Literal('UPDATE_VOTING_SETTINGS'),
  Schema.Literal('UNKNOWN')
);

type ApiActionType = Schema.Schema.Type<typeof ApiActionTypeSchema>;

/**
 * Schema for API action.
 */
const ApiActionSchema = Schema.Struct({
  actionType: ApiActionTypeSchema,
  targetId: Schema.optional(Schema.String),
  contentUri: Schema.optional(Schema.String),
});

/**
 * Schema for API proposal status response.
 */
const ApiProposalStatusResponseSchema = Schema.Struct({
  proposalId: Schema.String,
  spaceId: Schema.String,
  name: Schema.NullOr(Schema.String),
  proposedBy: Schema.String,
  status: Schema.Union(
    Schema.Literal('PROPOSED'),
    Schema.Literal('EXECUTABLE'),
    Schema.Literal('ACCEPTED'),
    Schema.Literal('REJECTED')
  ),
  votingMode: Schema.Union(Schema.Literal('FAST'), Schema.Literal('SLOW')),
  actions: Schema.Array(ApiActionSchema),
  votes: Schema.Struct({
    yes: Schema.Number,
    no: Schema.Number,
    abstain: Schema.Number,
    total: Schema.Number,
    voters: Schema.Array(ApiVoteSchema),
  }),
  userVote: Schema.NullOr(ApiVoteOptionSchema),
  quorum: Schema.Struct({
    required: Schema.Number,
    current: Schema.Number,
    progress: Schema.Number,
    reached: Schema.Boolean,
  }),
  threshold: Schema.Struct({
    required: Schema.String,
    current: Schema.Number,
    progress: Schema.Number,
    reached: Schema.Boolean,
  }),
  timing: Schema.Struct({
    startTime: Schema.Number,
    endTime: Schema.Number,
    timeRemaining: Schema.NullOr(Schema.Number),
    isVotingEnded: Schema.Boolean,
  }),
  canExecute: Schema.Boolean,
});

type ApiProposalStatusResponse = Schema.Schema.Type<typeof ApiProposalStatusResponseSchema>;

/**
 * Schema for API proposal list response.
 */
const ApiProposalListResponseSchema = Schema.Struct({
  proposals: Schema.Array(ApiProposalStatusResponseSchema),
  nextCursor: Schema.NullOr(Schema.String),
});

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

function mapActionTypeToProposalType(actionType: ApiActionType): ProposalType {
  switch (actionType) {
    case 'PUBLISH':
      return 'ADD_EDIT';
    case 'ADD_EDITOR':
      return 'ADD_EDITOR';
    case 'REMOVE_EDITOR':
      return 'REMOVE_EDITOR';
    case 'ADD_MEMBER':
      return 'ADD_MEMBER';
    case 'REMOVE_MEMBER':
      return 'REMOVE_MEMBER';
    default:
      // Default to ADD_EDIT for unknown action types
      return 'ADD_EDIT';
  }
}

// Convert API VoteOption to internal vote format
function convertVoteOption(vote: ApiVoteOption): 'ACCEPT' | 'REJECT' {
  return vote === 'YES' ? 'ACCEPT' : 'REJECT';
}

function mapProposalStatus(apiStatus: ApiProposalStatusResponse['status']): ProposalStatus {
  switch (apiStatus) {
    case 'PROPOSED':
      return 'PROPOSED';
    case 'EXECUTABLE':
      return 'PROPOSED'; // Still in proposed state until executed
    case 'ACCEPTED':
      return 'ACCEPTED';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return 'PROPOSED';
  }
}

function apiProposalToGovernanceDto(
  proposal: ApiProposalStatusResponse,
  maybeProfile?: Profile
): GovernanceProposal {
  const profile = maybeProfile ?? {
    id: proposal.proposedBy,
    spaceId: proposal.proposedBy,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.proposedBy as `0x${string}`,
    profileLink: null,
  };

  // Get proposal name from actions
  const firstAction = proposal.actions[0];
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  // Convert API votes to internal format
  const votes: SubstreamVote[] = proposal.votes.voters.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  // Build user votes from the API's userVote field
  const userVotes: SubstreamVote[] = proposal.userVote
    ? [
        {
          vote: convertVoteOption(proposal.userVote),
          accountId: Address(proposal.proposedBy), // Note: this is a placeholder, actual voter ID would need to be passed
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
 * Check if a string looks like a valid UUID (32 hex chars without dashes, or with dashes).
 */
const isValidUUID = (id: string | undefined): boolean => {
  if (!id) return false;
  // Remove dashes and check if it's 32 hex characters
  const noDashes = id.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(noDashes);
};

/**
 * Fetch governance proposals for a space using the new REST API.
 *
 * Excludes membership proposals (ADD_MEMBER, REMOVE_MEMBER, ADD_EDITOR, REMOVE_EDITOR)
 * which are shown in the home feed instead.
 *
 * The API handles status computation server-side, so we can filter by canExecute
 * to find executable proposals.
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
  const config = Environment.getConfig();

  // Build query parameters
  const params = new URLSearchParams();
  params.set('limit', String(first * 3)); // Fetch more to account for filtering

  // Exclude membership proposals - use action type filtering
  params.set('excludeActionTypes', 'AddMember,RemoveMember,AddEditor,RemoveEditor');

  // If we have the user's member space ID, pass it to get their votes
  if (connectedAddress && isValidUUID(connectedAddress)) {
    params.set('voterId', connectedAddress);
  }

  // For page-based pagination, we fetch from the beginning and slice
  // This is a temporary solution - ideally we'd use cursor pagination
  const path = `/proposals/space/${spaceId}/status?${params.toString()}`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
      })
    )
  );

  if (Either.isLeft(result)) {
    const error = result.left;
    console.error(`Failed to fetch governance proposals for space ${spaceId}:`, error);
    return [];
  }

  // Validate response with Effect Schema
  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode governance proposals for space ${spaceId}:`, decoded.left);
    return [];
  }

  const allProposals = decoded.right.proposals;

  // Separate proposals by status
  // EXECUTABLE proposals come first, then PROPOSED (active), then ACCEPTED/REJECTED (completed)
  const executableProposals = allProposals.filter(p => p.canExecute && p.status === 'EXECUTABLE');
  const activeProposals = allProposals.filter(p => p.status === 'PROPOSED' && !p.canExecute);
  const completedProposals = allProposals.filter(p => p.status === 'ACCEPTED' || p.status === 'REJECTED');

  // Combine in the desired order
  const sortedProposals = [...executableProposals, ...activeProposals, ...completedProposals];

  // Apply pagination
  const startIndex = page * first;
  const paginatedProposals = sortedProposals.slice(startIndex, startIndex + first);

  // Fetch profiles for creators
  const proposedByIds = paginatedProposals.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueProposedByIds));

  // Create a map of memberSpaceId -> profile for efficient lookup
  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));

  return paginatedProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return apiProposalToGovernanceDto(p, maybeProfile);
  });
}
