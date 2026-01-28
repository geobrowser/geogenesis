/**
 * @TODO finish v2 API migration for governance proposals
 *
 * Known issues:
 * - User vote filtering doesn't work yet (v2 uses memberSpaceId, not wallet address)
 * - ABSTAIN votes are mapped to REJECT (may need different handling)
 * - Proposal names come from metadata/actionType (may need improvement)
 */
import { Effect, Either } from 'effect';
import { cookies } from 'next/headers';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '~/core/io/schema';
import { fetchProfile } from '~/core/io/subgraph';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profiles-by-ids';
import { graphql } from '~/core/io/subgraph/graphql';
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
    fetchProposals({ spaceId, first: 5, page, connectedAddress }),
    connectedAddress ? fetchProfile({ walletAddress: connectedAddress }) : null,
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

interface V2Proposal {
  id: string;
  createdAt: string;
  createdAtBlock: string;
  startTime: string;
  endTime: string;
  executedAt: string | null;
  proposedBy: string;
  proposalVotesConnection: {
    totalCount: number;
    nodes: Array<{
      vote: 'YES' | 'NO' | 'ABSTAIN';
      voterId: string;
    }>;
  };
  proposalActions: Array<{
    actionType: string;
    contentUri: string | null;
    metadata: string | null;
  }>;
  userVotes: {
    nodes: Array<{
      vote: 'YES' | 'NO' | 'ABSTAIN';
      voterId: string;
    }>;
  };
}

interface NetworkResult {
  executableProposals: {
    nodes: V2Proposal[];
  };
  activeProposals: {
    nodes: V2Proposal[];
  };
  completedProposals: {
    nodes: V2Proposal[];
  };
}

type ActiveProposal = {
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

function mapActionTypeToProposalType(actionType: string): ProposalType {
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
    case 'ADD_SUBSPACE':
      return 'ADD_SUBSPACE';
    case 'REMOVE_SUBSPACE':
      return 'REMOVE_SUBSPACE';
    default:
      // Default to ADD_EDIT for unknown action types
      return 'ADD_EDIT';
  }
}

// Convert v2 VoteOption to v1 vote format
function convertVoteOption(vote: 'YES' | 'NO' | 'ABSTAIN'): 'ACCEPT' | 'REJECT' {
  return vote === 'YES' ? 'ACCEPT' : 'REJECT';
}

function getProposalStatus(proposal: V2Proposal): ProposalStatus {
  const now = Math.floor(Date.now() / 1000);
  const endTime = Number(proposal.endTime);

  if (proposal.executedAt) {
    return 'ACCEPTED';
  }
  if (endTime < now) {
    return 'REJECTED'; // Expired without execution
  }
  return 'PROPOSED';
}

function ActiveProposalsDto(proposal: V2Proposal, maybeProfile?: Profile): ActiveProposal {
  const profile = maybeProfile ?? {
    id: proposal.proposedBy,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.proposedBy as `0x${string}`,
    profileLink: null,
  };

  // Get proposal name from metadata or action type
  const firstAction = proposal.proposalActions[0];
  const name = firstAction?.metadata ?? firstAction?.actionType ?? null;
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  // @TODO make v2 standard
  // Convert v2 votes to v1 format
  const votes: SubstreamVote[] = proposal.proposalVotesConnection.nodes.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  const userVotes: SubstreamVote[] = proposal.userVotes.nodes.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  return {
    id: proposal.id,
    name,
    type: proposalType,
    createdAt: Number(proposal.createdAt) || 0,
    createdAtBlock: proposal.createdAtBlock,
    startTime: Number(proposal.startTime),
    endTime: Number(proposal.endTime),
    status: getProposalStatus(proposal),
    createdBy: profile,
    userVotes,
    proposalVotes: {
      totalCount: proposal.proposalVotesConnection.totalCount,
      votes,
    },
  };
}

// Check if a string looks like a valid UUID (32 hex chars without dashes, or with dashes)
const isValidUUID = (id: string | undefined): boolean => {
  if (!id) return false;
  // Remove dashes and check if it's 32 hex characters
  const noDashes = id.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(noDashes);
};

// v2 proposal fields fragment
// Note: userVotes filter only works with valid UUID (memberSpaceId), not wallet addresses
const getProposalFields = (connectedMemberSpaceId: string | undefined) => {
  const hasValidMemberSpaceId = isValidUUID(connectedMemberSpaceId);

  return `
  id
  createdAt
  createdAtBlock
  startTime
  endTime
  executedAt
  proposedBy
  proposalVotesConnection {
    totalCount
    nodes {
      vote
      voterId
    }
  }
  proposalActions {
    actionType
    contentUri
    metadata
  }
  ${
    hasValidMemberSpaceId
      ? `userVotes: proposalVotesConnection(
    filter: {
      voterId: { is: "${connectedMemberSpaceId}" }
    }
  ) {
    nodes {
      vote
      voterId
    }
  }`
      : `userVotes: proposalVotesConnection(first: 0) {
    nodes {
      vote
      voterId
    }
  }`
  }
`;
};

const getFetchActiveProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedMemberSpaceId: string | undefined
) => {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();
  return `
  activeProposals: proposalsConnection(
    first: ${first}
    offset: ${skip}
    orderBy: END_TIME_DESC
    filter: {
      spaceId: { is: "${spaceId}" }
      endTime: { greaterThanOrEqualTo: "${nowSeconds}" }
      executedAt: { isNull: true }
    }
  ) {
    nodes {
      ${getProposalFields(connectedMemberSpaceId)}
    }
  }
`;
};

const getFetchCompletedProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedMemberSpaceId: string | undefined
) => {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();
  // Completed = executed OR (expired AND not executed)
  // We fetch both executed and expired separately and merge client-side
  // For now, fetch executed proposals (accepted)
  return `
  completedProposals: proposalsConnection(
    first: ${first}
    offset: ${skip}
    orderBy: END_TIME_DESC
    filter: {
      spaceId: { is: "${spaceId}" }
      or: [
        { executedAt: { isNull: false } }
        { and: [
          { endTime: { lessThan: "${nowSeconds}" } }
          { executedAt: { isNull: true } }
        ]}
      ]
    }
  ) {
    nodes {
      ${getProposalFields(connectedMemberSpaceId)}
    }
  }
`;
};

/**
 * Content proposals have reached quorum when at least one editor has voted, except
 * in cases where there is only one editor vote, and the vote is from the creator
 * of the proposal. Quorum requires at least one _additional_ editor vote.
 *
 * Content proposals are "passed" when at least one editor has voted and the votes
 * for the proposal are > 50%.
 */
const getFetchMaybeExecutableProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedMemberSpaceId: string | undefined
) => {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();
  // Executable = voting period ended but not yet executed
  return `
  executableProposals: proposalsConnection(
    first: ${first}
    offset: ${skip}
    orderBy: END_TIME_DESC
    filter: {
      spaceId: { is: "${spaceId}" }
      endTime: { lessThanOrEqualTo: "${nowSeconds}" }
      executedAt: { isNull: true }
    }
  ) {
    nodes {
      ${getProposalFields(connectedMemberSpaceId)}
    }
  }
`;
};

// Note: connectedMemberSpaceId should be the user's personal space ID (memberSpaceId)
// In v2, votes are filtered by memberSpaceId, not wallet address
const allProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedMemberSpaceId: string | undefined
) => `
  query {
    ${getFetchMaybeExecutableProposalsQuery(spaceId, first, skip, connectedMemberSpaceId)}
    ${getFetchActiveProposalsQuery(spaceId, first, skip, connectedMemberSpaceId)}
    ${getFetchCompletedProposalsQuery(spaceId, first, skip, connectedMemberSpaceId)}
  }
`;

async function fetchProposals({
  spaceId,
  connectedAddress,
  first = 5,
  page = 0,
}: {
  spaceId: string;
  first: number;
  page: number;
  connectedAddress: string | undefined;
}) {
  const offset = page * first;

  // TODO(v2-migration): connectedAddress is a wallet address, but v2 uses memberSpaceId for filtering votes
  // For now, pass it through but the user vote filtering won't work correctly until we convert
  // wallet address to memberSpaceId
  const connectedMemberSpaceId = connectedAddress;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: allProposalsQuery(spaceId, first, offset, connectedMemberSpaceId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in governance proposals list. spaceId: ${spaceId} page: ${page}

            queryString: ${getFetchActiveProposalsQuery(spaceId, first, offset, connectedMemberSpaceId)}
            `,
            error.message
          );
          return {
            executableProposals: {
              nodes: [],
            },
            activeProposals: {
              nodes: [],
            },
            completedProposals: {
              nodes: [],
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals, spaceId: ${spaceId} page: ${page}`);
          return {
            executableProposals: {
              nodes: [],
            },
            activeProposals: {
              nodes: [],
            },
            completedProposals: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  // Only show executable proposals under the following conditions:
  // 1. The proposal has reached quorum
  // 2. The proposal has not been executed
  // 3. The proposal has enough votes to pass
  const executableProposals = result.executableProposals.nodes
    // Votes should be >= 50%
    .filter(p => {
      const votes = p.proposalVotesConnection.nodes;
      if (votes.length === 0) return false;
      const votesFor = votes.filter(v => v.vote === 'YES');
      const yesPercentage = Math.floor((votesFor.length / votes.length) * 100);
      return yesPercentage > 50;
    })
    // Quorum
    .filter(p => {
      if (p.proposalVotesConnection.totalCount === 1 && p.proposedBy === p.proposalVotesConnection.nodes[0].voterId) {
        return false;
      }

      return true;
    });

  const proposals = [
    ...executableProposals.filter(p => p !== null),
    ...result.activeProposals.nodes,
    ...result.completedProposals.nodes,
  ];

  // In v2, proposedBy is a memberSpaceId (personal space ID)
  const proposedByIds = proposals.map(p => p.proposedBy);
  const uniqueProposedByIds = [...new Set(proposedByIds)];
  const profilesForProposals = await fetchProfilesBySpaceIds(uniqueProposedByIds);

  // Create a map of memberSpaceId -> profile for efficient lookup
  const profilesBySpaceId = new Map(uniqueProposedByIds.map((id, i) => [id, profilesForProposals[i]]));

  return proposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return ActiveProposalsDto(p, maybeProfile);
  });
}
