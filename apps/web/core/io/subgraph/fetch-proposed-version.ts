import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { ProposedVersion, SpaceWithMetadata } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { fetchProfile } from './fetch-profile';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, SubstreamProposedVersion, fromNetworkTriples } from './network-local-mapping';

export const getProposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
    id
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
}`;

export interface FetchProposedVersionOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposedVersion: SubstreamProposedVersion | null;
}

export async function fetchProposedVersion({
  id,
  signal,
}: FetchProposedVersionOptions): Promise<ProposedVersion | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedVersionQuery(id),
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
            `Encountered runtime graphql error in proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}
            
            queryString: ${getProposedVersionQuery(id)}
            `,
            error.message
          );

          return {
            proposedVersion: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}`
          );

          return {
            proposedVersion: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedVersion = result.proposedVersion;

  if (!proposedVersion) {
    return null;
  }

  const profile = await fetchProfile({ address: proposedVersion.createdBy.id });
  const spaceConfig = proposedVersion.space.spacesMetadata.nodes[0].entity as SubstreamEntity | undefined;
  const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: proposedVersion.space.id,
    name: spaceConfig?.name ?? null,
    image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    ...proposedVersion,
    space: spaceWithMetadata,
    // ops: fromNetworkOps(proposedVersion.actions.nodes),
    createdBy: profile,
  };
}
