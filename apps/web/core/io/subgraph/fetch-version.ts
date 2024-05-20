import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Profile, SpaceWithMetadata, Version } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { entityFragment, tripleFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, SubstreamVersion, fromNetworkTriples } from './network-local-mapping';

const getVersionsQuery = (versionId: string) => `query {
  version(id: ${JSON.stringify(versionId)}) {
    id
    name
    createdAt
    createdAtBlock

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
}`;

export interface FetchVersionOptions {
  versionId: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  version: SubstreamVersion | null;
}

export async function fetchVersion({ versionId, signal, page = 0 }: FetchVersionOptions): Promise<Version | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getVersionsQuery(versionId),
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
            `Encountered runtime graphql error in fetchVersion. queryId: ${queryId} versionId: ${versionId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getVersionsQuery(versionId)}
            `,
            error.message
          );

          return {
            version: null,
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch fetchVersion. queryId: ${queryId} versionId: ${versionId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            version: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const version = result.version;

  if (!version) {
    return null;
  }

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfile = version.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
  const onchainProfile = version.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
  const profileTriples = fromNetworkTriples(maybeProfile?.triples.nodes ?? []);

  const profile: Profile = maybeProfile
    ? {
        id: version.createdBy.id,
        address: version.createdBy.id as `0x${string}`,
        avatarUrl: Entity.avatar(profileTriples),
        coverUrl: Entity.cover(profileTriples),
        name: maybeProfile.name,
        profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
      }
    : {
        id: version.createdBy.id,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: version.createdBy.id as `0x${string}`,
        profileLink: null,
      };

  const networkTriples = version.tripleVersions.nodes.flatMap(tv => tv.triple);

  const spaceConfig = version.space.metadata.nodes[0] as SubstreamEntity | undefined;
  const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: version.space.id,
    name: spaceConfig?.name ?? null,
    image: Entity.avatar(spaceConfigTriples) ?? Entity.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    ...version,
    createdBy: profile,
    space: spaceWithMetadata,
    triples: fromNetworkTriples(networkTriples),
  };
}
