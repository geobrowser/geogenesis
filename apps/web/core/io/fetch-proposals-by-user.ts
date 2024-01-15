import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Proposal } from '~/core/types';

import { Environment } from '../environment';
import { fetchProfile } from './subgraph';
import { graphql } from './subgraph/graphql';
import { SubstreamProposal, fromNetworkActions } from './subgraph/network-local-mapping';

const getFetchUserProposalsQuery = (createdBy: string, skip: number, spaceId?: string) => {
  const filter = [
    `createdById: { startsWithInsensitive: "${createdBy}" }`,
    spaceId && `spaceId: { equalTo: "${spaceId}" }`,
  ]
    .filter(Boolean)
    .join(' ');

  return `query {
    proposals(first: 5, filter: {${filter}}, orderBy: CREATED_AT_DESC, offset: ${skip}) {
      nodes {
        id
        name
        spaceId
        createdAtBlock
        createdById
        createdAt
        status
        proposedVersions {
          nodes {
            id
            name
            createdById
            entity {
              id
              name
            }
            actions {
              nodes {
                id
                actionType
                attribute {
                  id
                  name
                }
                entity {
                  id
                  name
                }
                entityValue
                numberValue
                stringValue
                valueType
                valueId
              }
            }
          }
        }
      }
    }
  }`;
};

export interface FetchUserProposalsOptions {
  userId: string; // For now we use the address
  signal?: AbortController['signal'];
  spaceId?: string;
  page?: number;
  api: {
    fetchProfile: typeof fetchProfile;
  };
}

interface NetworkResult {
  proposals: { nodes: SubstreamProposal[] };
}

export async function fetchProposalsByUser({
  userId,
  spaceId,
  signal,
  page = 0,
}: FetchUserProposalsOptions): Promise<Proposal[]> {
  const queryId = uuid();
  const offset = page * 5;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchUserProposalsQuery(userId, offset, spaceId),
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
            `Encountered runtime graphql error in fetchProposals. queryId: ${queryId} userId: ${userId} page: ${page}
            
            queryString: ${getFetchUserProposalsQuery(userId, offset)}
            `,
            error.message
          );
          return {
            proposals: {
              nodes: [],
            },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} userId: ${userId} page: ${page}`
          );
          return {
            proposals: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposals = result.proposals.nodes;

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const profile = await fetchProfile({
    address: userId,
  });

  return proposals.map(p => {
    return {
      ...p,
      name: p.name,
      description: p.description,
      space: p.spaceId,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profile?.[1] ?? {
        id: p.createdById,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: p.createdById as `0x${string}`,
        profileLink: null,
      },
      proposedVersions: p.proposedVersions.nodes.map(v => {
        return {
          ...v,
          createdBy: profile?.[1] ?? {
            id: p.createdById,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: p.createdById as `0x${string}`,
            profileLink: null,
          },
          actions: fromNetworkActions(v.actions.nodes, userId),
        };
      }),
    };
  });
}
