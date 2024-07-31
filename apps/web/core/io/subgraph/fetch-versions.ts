import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Profile, SpaceWithMetadata, Version } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { SubstreamEntity, SubstreamVersion, fromNetworkTriples } from '../schema';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

const getVersionsQuery = (entityId: string, offset: number, proposalId?: string) => {
  const filter = [
    `entityId: { equalTo: ${JSON.stringify(entityId)} }`,
    proposalId && `proposedVersion: { proposalId: { equalTo: ${JSON.stringify(proposalId)} } }`,
  ]
    .filter(Boolean)
    .join(' ');

  return `query {
    versions(filter: {${filter}}, orderBy: CREATED_AT_DESC, first: 5, offset: ${offset}) {
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

        entity {
          id
          name
        }
        tripleVersions {
          nodes {
            triple {
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
  proposalId?: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  versions: { nodes: SubstreamVersion[] };
}

export async function fetchVersions({
  entityId,
  signal,
  proposalId,
  page = 0,
}: FetchVersionsOptions): Promise<Version[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getVersionsQuery(entityId, page * 5, proposalId),
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
            
            queryString: ${getVersionsQuery(entityId, page * 5, proposalId)}
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
  const profilesForProposals = await fetchProfilesByAddresses(versions.map(p => p.createdBy.id));

  return versions.map(v => {
    const networkTriples = v.tripleVersions.nodes.flatMap(tv => tv.triple);
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
      triples: fromNetworkTriples(networkTriples),
    };
  });
}
