import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { fetchProfile } from '~/core/io/subgraph';
import { entityFragment, tripleFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamEntity, SubstreamVersion, fromNetworkTriples } from '~/core/io/subgraph/network-local-mapping';
import { Profile, SpaceWithMetadata, Version } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

const getVersionsQuery = ({
  entityId,
  offset,
  createdAt,
  proposalId,
}: {
  entityId: string;
  offset: number;
  createdAt: string;
  proposalId?: string;
}) => {
  const filter = [
    `entityId: { equalTo: ${JSON.stringify(entityId)} }`,
    `createdAt: { lessThan: ${JSON.stringify(createdAt)} }`,
    proposalId && `proposedVersion: { proposalId: { equalTo: ${JSON.stringify(proposalId)} } }`,
  ]
    .filter(Boolean)
    .join(' ');

  return `query {
    versions(filter: {${filter}}, orderBy: CREATED_AT_DESC, first: 1, offset: ${offset}) {
      nodes {
        id
        name
        createdAt

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

        space {
          id
          metadata {
            nodes {
              ${entityFragment}
            }           
          }
        }

        entity {
          id
          name
        }
        tripleVersions {
          nodes {
            triple {
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
              space {
                id
              }
            }
          }
        }
      }
    }
  }`;
};

export interface FetchVersionsOptions {
  entityId: string;
  createdAt: string;
  proposalId?: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  versions: { nodes: SubstreamVersion[] };
}

export async function fetchVersionsByCreatedAt({
  entityId,
  createdAt,
  signal,
  proposalId,
  page = 0,
}: FetchVersionsOptions): Promise<Version[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getVersionsQuery({ entityId, offset: page * 5, createdAt, proposalId }),
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
            `Encountered runtime graphql error in fetchVersions. queryId: ${queryId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getVersionsQuery({ entityId, offset: page * 5, createdAt, proposalId })}
            `,
            error.message
          );

          return {
            versions: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch fetchVersions. queryId: ${queryId} entityId: ${entityId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            versions: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const versions = result.versions.nodes;

  return versions.map(v => {
    const maybeProfile = v.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
    const onchainProfile = v.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
    const profileTriples = fromNetworkTriples(maybeProfile?.triples.nodes ?? []);

    const profile: Profile = maybeProfile
      ? {
          id: v.createdBy.id,
          address: v.createdBy.id as `0x${string}`,
          avatarUrl: Entities.avatar(profileTriples),
          coverUrl: Entities.cover(profileTriples),
          name: maybeProfile.name,
          profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
        }
      : {
          id: v.createdBy.id,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: v.createdBy.id as `0x${string}`,
          profileLink: null,
        };

    const spaceConfig = v.space.metadata.nodes[0] as SubstreamEntity | undefined;
    const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

    const spaceWithMetadata: SpaceWithMetadata = {
      id: v.space.id,
      name: spaceConfig?.name ?? null,
      image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
    };
    const networkTriples = v.tripleVersions.nodes.flatMap(tv => tv.triple);

    return {
      id: v.id,
      name: v.name,
      description: null,
      entity: v.entity,
      createdAt: v.createdAt,
      space: spaceWithMetadata,
      createdBy: profile,
      triples: fromNetworkTriples(networkTriples),
    };
  });
}
