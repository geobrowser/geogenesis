import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Profile, Proposal, SpaceWithMetadata } from '~/core/types';

import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { Environment } from '../environment';
import { Entity } from '../utils/entity';
import { NavUtils } from '../utils/utils';
import { graphql } from './subgraph/graphql';
import {
  SubstreamEntity,
  SubstreamProposal,
  fromNetworkActions,
  fromNetworkTriples,
} from './subgraph/network-local-mapping';

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
        space {
          id
          metadata {
            nodes {
              id
              name
              triplesByEntityId(filter: {isStale: {equalTo: false}}) {
                nodes {
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
                  isProtected
                  space {
                    id
                  }
                }
              }
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
              triplesByEntityId(filter: {isStale: {equalTo: false}}) {
                nodes {
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
                  isProtected
                  space {
                    id
                  }
                }
              }
            }
          }
        }

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

  return proposals.map(p => {
    const maybeProfile = p.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
    const onchainProfile = p.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
    const profileTriples = fromNetworkTriples(maybeProfile?.triplesByEntityId.nodes ?? []);

    const profile: Profile = maybeProfile
      ? {
          id: p.createdBy.id,
          address: p.createdBy.id as `0x${string}`,
          avatarUrl: Entity.avatar(profileTriples),
          coverUrl: Entity.cover(profileTriples),
          name: maybeProfile.name,
          profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
        }
      : {
          id: p.createdBy.id,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: p.createdBy.id as `0x${string}`,
          profileLink: null,
        };

    const spaceConfig = p.space.metadata.nodes[0] as SubstreamEntity | undefined;
    const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triplesByEntityId.nodes ?? []);

    const spaceWithMetadata: SpaceWithMetadata = {
      id: p.space.id,
      name: spaceConfig?.name ?? null,
      image: Entity.avatar(spaceConfigTriples) ?? Entity.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
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
          actions: fromNetworkActions(v.actions.nodes, userId),
        };
      }),
    };
  });
}
