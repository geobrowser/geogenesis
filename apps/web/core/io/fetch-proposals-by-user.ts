import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Proposal } from '~/core/types';

import { fetchProfile } from './subgraph';
import { graphql } from './subgraph/graphql';
import { NetworkProposal, fromNetworkActions } from './subgraph/network-local-mapping';

const getFetchUserProposalsQuery = (createdBy: string, skip: number) => `query {
  proposals(first: 10, where: {createdBy_starts_with_nocase: ${JSON.stringify(
    createdBy
  )}}, orderBy: createdAt, orderDirection: desc, skip: ${skip}) {
    id
    name
    description
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    status
    proposedVersions {
      id
      name
      createdAt
      createdAtBlock
      createdBy {
        id
      }
      actions {
        actionType
        id
        attribute {
          id
          name
        }
        entity {
          id
          name
        }
        entityValue {
          id
          name
        }
        numberValue
        stringValue
        valueType
        valueId
      }
    }
  }
}`;

export interface FetchUserProposalsOptions {
  endpoint: string;
  userId: string; // For now we use the address
  signal?: AbortController['signal'];
  page?: number;
  api: {
    fetchProfile: typeof fetchProfile;
  };
}

interface NetworkResult {
  proposals: NetworkProposal[];
}

export async function fetchProposalsByUser({
  endpoint,
  userId,
  signal,
  page = 0,
}: FetchUserProposalsOptions): Promise<Proposal[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getFetchUserProposalsQuery(userId, page * 10),
    signal,
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
            `Encountered runtime graphql error in fetchProposals. queryId: ${queryId} userId: ${userId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getFetchUserProposalsQuery(userId, page * 10)}
            `,
            error.message
          );
          return {
            proposals: [],
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} userId: ${userId} endpoint: ${endpoint} page: ${page}`
          );
          return {
            proposals: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const profile = await fetchProfile({
    endpoint,
    address: userId,
  });

  return result.proposals.map(p => {
    return {
      ...p,
      name: p.name,
      description: p.description,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profile?.[1] ?? p.createdBy,
      proposedVersions: p.proposedVersions.map(v => {
        return {
          ...v,
          createdBy: profile?.[1] ?? p.createdBy,
          actions: fromNetworkActions(v.actions, userId),
        };
      }),
    };
  });
}
