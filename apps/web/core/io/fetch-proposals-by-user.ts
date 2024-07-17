import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Proposal, SpaceWithMetadata } from '~/core/types';

import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { Environment } from '../environment';
import { Entities } from '../utils/entity';
import { fetchProfilesByAddresses } from './subgraph/fetch-profiles-by-ids';
import { entityFragment, tripleFragment } from './subgraph/fragments';
import { graphql } from './subgraph/graphql';
import { SubstreamEntity, SubstreamProposal, fromNetworkTriples } from './subgraph/network-local-mapping';

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
        type
        space {
          id
          metadata {
            nodes {
              ${entityFragment}
            }           
          }
        }
        createdAtBlock
        createdById
        createdAt
        status

        createdBy {
          id
          onchainProfiles {
            nodes {
              homeSpaceId
              id
            }
          }
          geoProfiles {
            nodes {
              id
              name
              triples(filter: {isStale: {equalTo: false}}) {
                nodes {
                  ${tripleFragment}
                }
              }
            }
          }
        }

        proposedVersions {
          nodes {
            id
            createdById
            entity {
              id
              name
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
    endpoint: Environment.getConfig().api,
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
            `Encountered runtime graphql error in fetchProposalsByUser. queryId: ${queryId} userId: ${userId} page: ${page}
            
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
  const profilesForProposals = await fetchProfilesByAddresses(proposals.map(p => p.createdBy.id));

  return proposals.map(p => {
    const maybeProfile = profilesForProposals.find(profile => profile.address === p.createdBy.id);

    const profile = maybeProfile ?? {
      id: p.createdBy.id,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: p.createdBy.id as `0x${string}`,
      profileLink: null,
    };

    const spaceConfig = p.space.metadata.nodes[0] as SubstreamEntity | undefined;
    const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

    const spaceWithMetadata: SpaceWithMetadata = {
      id: p.space.id,
      name: spaceConfig?.name ?? null,
      image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
    };

    return {
      ...p,
      name: p.name,
      description: p.description,
      space: spaceWithMetadata,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profile,
      proposedVersions: p.proposedVersions.nodes.map(v => {
        return {
          ...v,
          space: spaceWithMetadata,
          createdBy: profile,
          // actions: fromNetworkOps(v.actions.nodes),
        };
      }),
    };
  });
}
