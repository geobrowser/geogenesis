// @TODO complete v2 migration
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Proposal } from '../dto/proposals';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '../substream-schema';
import { fetchProfileBySpaceId, fetchProfilesBySpaceIds } from './fetch-profile';
import { graphql } from './graphql';

export const getFetchProposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    createdAt
    createdAtBlock
    startTime
    endTime
    executedAt
    proposedBy
    spaceId
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
  }
}`;

export interface FetchProposalOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface V2Proposal {
  id: string;
  createdAt: string;
  createdAtBlock: string;
  startTime: string;
  endTime: string;
  executedAt: string | null;
  proposedBy: string;
  spaceId: string;
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
}

interface NetworkResult {
  proposal: V2Proposal | null;
}

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
      return 'ADD_EDIT';
  }
}

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
    return 'REJECTED';
  }
  return 'PROPOSED';
}

export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchProposalQuery(options.id),
    signal: options?.signal,
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchProposal. queryId: ${queryId} id: ${options.id}

            queryString: ${getFetchProposalQuery(options.id)}
            `,
            error.message
          );

          return {
            proposal: null,
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposal, queryId: ${queryId} id: ${options.id}`);
          return {
            proposal: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const proposal = result.proposal;

  if (!proposal) {
    return null;
  }

  const voterIds = proposal.proposalVotesConnection.nodes.map(v => v.voterId);
  const [creatorProfile, voterProfiles] = await Promise.all([
    Effect.runPromise(fetchProfileBySpaceId(proposal.proposedBy)),
    Effect.runPromise(fetchProfilesBySpaceIds(voterIds)),
  ]);

  const firstAction = proposal.proposalActions[0];
  const name = firstAction?.metadata ?? firstAction?.actionType ?? null;
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  const votes: SubstreamVote[] = proposal.proposalVotesConnection.nodes.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  const profile = creatorProfile ?? {
    id: proposal.proposedBy,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.proposedBy as `0x${string}`,
    profileLink: null,
  };

  const votesWithProfiles = votes.map((v, i) => {
    const maybeProfile = voterProfiles[i];
    const voter = maybeProfile ?? {
      id: v.accountId,
      address: v.accountId as `0x${string}`,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      profileLink: null,
    };
    return { ...v, voter };
  });

  return {
    id: proposal.id,
    editId: '',
    name,
    type: proposalType,
    createdAt: Number(proposal.createdAt) || 0,
    createdAtBlock: proposal.createdAtBlock,
    startTime: Number(proposal.startTime),
    endTime: Number(proposal.endTime),
    status: getProposalStatus(proposal),
    space: {
      id: proposal.spaceId,
      name: null,
      image: '',
    },
    createdBy: profile,
    proposalVotes: {
      totalCount: proposal.proposalVotesConnection.totalCount,
      nodes: votesWithProfiles,
    },
  };
}
