import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Profile, ProposedVersion, SpaceWithMetadata } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { graphql } from './graphql';
import {
  SubstreamEntity,
  SubstreamProposedVersion,
  fromNetworkOps,
  fromNetworkTriples,
} from './network-local-mapping';
import { geoEntityFragment, tripleFragment } from './fragments';

const getProposedVersionsQuery = (entityId: string, skip: number) => `query {
  proposedVersions(filter: {entityId: {equalTo: ${JSON.stringify(
    entityId
  )}}}, orderBy: CREATED_AT_DESC, first: 10, offset: ${skip}) {
    nodes {
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
            triplesByEntityId(filter: {isStale: {equalTo: false}}) {
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
            ${geoEntityFragment}
          }           
        }
      }

      actions {
        nodes {
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
          entityValue
          numberValue
          stringValue
          valueType
          valueId
        }
      }
    }
  }
}`;

export interface FetchProposedVersionsOptions {
  entityId: string;
  spaceId: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposedVersions: { nodes: SubstreamProposedVersion[] };
}

export async function fetchProposedVersions({
  entityId,
  spaceId,
  signal,
  page = 0,
}: FetchProposedVersionsOptions): Promise<ProposedVersion[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedVersionsQuery(entityId, page * 10),
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
            `Encountered runtime graphql error in fetchProposedVersions. queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getProposedVersionsQuery(entityId, page * 10)}
            `,
            error.message
          );

          return {
            proposedVersions: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposedVersions. queryId: ${queryId} entityId: ${entityId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            proposedVersions: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedVersions = result.proposedVersions.nodes;

  return proposedVersions.map(v => {
    const maybeProfile = v.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
    const onchainProfile = v.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
    const profileTriples = fromNetworkTriples(maybeProfile?.triplesByEntityId.nodes ?? []);

    const profile: Profile = maybeProfile
      ? {
          id: v.createdBy.id,
          address: v.createdBy.id as `0x${string}`,
          avatarUrl: Entity.avatar(profileTriples),
          coverUrl: Entity.cover(profileTriples),
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
    const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triplesByEntityId.nodes ?? []);

    const spaceWithMetadata: SpaceWithMetadata = {
      id: v.space.id,
      name: spaceConfig?.name ?? null,
      image: Entity.avatar(spaceConfigTriples) ?? Entity.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
    };

    return {
      ...v,
      createdBy: profile,
      space: spaceWithMetadata,
      actions: fromNetworkOps(v.actions.nodes, spaceId),
    };
  });
}
