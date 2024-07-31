import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Profile, ProposedVersion, SpaceWithMetadata } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { SubstreamEntity, SubstreamProposedVersion, fromNetworkTriples } from '../schema';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

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
      }

      space {
        id
        spacesMetadata {
          nodes {
            entity {
              ${spaceMetadataFragment}
            }
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
  const endpoint = Environment.getConfig().api;

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
  const profilesForProposals = await fetchProfilesByAddresses(proposedVersions.map(p => p.createdBy.id));

  return proposedVersions.map(v => {
    const maybeProfile = profilesForProposals.find(profile => profile.address === v.createdBy.id);

    const profile: Profile = maybeProfile
      ? maybeProfile
      : {
          id: v.createdBy.id,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: v.createdBy.id as `0x${string}`,
          profileLink: null,
        };

    const spaceConfig = v.space.spacesMetadata.nodes[0].entity as SubstreamEntity | undefined;
    const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

    const spaceWithMetadata: SpaceWithMetadata = {
      id: v.space.id,
      name: spaceConfig?.name ?? null,
      image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
    };

    return {
      ...v,
      createdBy: profile,
      space: spaceWithMetadata,
      // actions: fromNetworkOps(v.actions.nodes),
    };
  });
}
