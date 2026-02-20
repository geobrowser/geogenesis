import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { Environment } from '../environment';
import { deriveProposalStatus } from '../utils/utils';
import { ProposalWithoutVoters } from './dto/proposals';
import { mapActionTypeToProposalType } from './rest';
import { fetchProfilesBySpaceIds } from './subgraph/fetch-profile';
import { graphql } from './subgraph/graphql';

type NetworkProposalAction = {
  actionType: string;
};

type NetworkProposal = {
  id: string;
  name: string | null;
  proposedBy: string;
  spaceId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  createdAtBlock: string;
  executedAt: string | null;
  proposalActions: NetworkProposalAction[];
};

const getFetchUserProposalsQuery = (proposedBy: string, skip: number, spaceId?: string) => {
  const filters = [
    `proposedBy: { is: "${proposedBy}" }`,
    spaceId && `spaceId: { is: "${spaceId}" }`,
  ]
    .filter(Boolean)
    .join('\n        ');

  return `query {
    proposalsConnection(
      first: 5
      offset: ${skip}
      orderBy: END_TIME_DESC
      filter: {
        ${filters}
      }
    ) {
      nodes {
        id
        name
        proposedBy
        spaceId
        startTime
        endTime
        createdAt
        createdAtBlock
        executedAt
        proposalActions {
          actionType
        }
      }
    }
  }`;
};

export type FetchUserProposalsOptions = {
  spaceId?: string;
  proposerSpaceId: string;
  signal?: AbortController['signal'];
  page?: number;
};

type NetworkResult = {
  proposalsConnection: { nodes: NetworkProposal[] };
};

export async function fetchProposalsByUser({
  proposerSpaceId,
  spaceId,
  signal,
  page = 0,
}: FetchUserProposalsOptions): Promise<ProposalWithoutVoters[]> {
  const queryId = uuid();
  const offset = page * 5;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchUserProposalsQuery(proposerSpaceId, offset, spaceId),
    signal,
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
            `Encountered runtime graphql error in fetchProposalsByUser. queryId: ${queryId} proposerSpaceId: ${proposerSpaceId} page: ${page}

            queryString: ${getFetchUserProposalsQuery(proposerSpaceId, offset)}
            `,
            error.message
          );
          return {
            proposalsConnection: {
              nodes: [],
            },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} proposerSpaceId: ${proposerSpaceId} page: ${page}`
          );
          return {
            proposalsConnection: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposals = result.proposalsConnection.nodes;

  const creatorIds = proposals.map(p => p.proposedBy);
  const uniqueCreatorIds = [...new Set(creatorIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
  const profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profilesForProposals[i]]));

  return proposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    const profile = maybeProfile ?? {
      id: p.proposedBy,
      spaceId: p.proposedBy,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: p.proposedBy as `0x${string}`,
      profileLink: null,
    };

    const actionType = p.proposalActions[0]?.actionType ?? 'UNKNOWN';
    const type = mapActionTypeToProposalType(actionType);
    const endTime = Number(p.endTime);
    const status = deriveProposalStatus(p.executedAt, endTime);

    return {
      id: p.id,
      editId: '',
      name: p.name,
      createdAt: 0,
      createdAtBlock: p.createdAtBlock ?? '0',
      type,
      startTime: Number(p.startTime),
      endTime,
      status,
      canExecute: false,
      space: {
        id: p.spaceId,
        name: null,
        image: PLACEHOLDER_SPACE_IMAGE,
      },
      createdBy: profile,
    };
  });
}
