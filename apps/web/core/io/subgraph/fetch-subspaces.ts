import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { GovernanceType, OmitStrict, Space } from '~/core/types';

import { entityFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, getSpaceConfigFromMetadata } from './network-local-mapping';

const getFetchSpacesQuery = (spaceId: string) => `query {
  spaceSubspaces(filter: { parentSpaceId: { equalTo: "${spaceId}" } }) {
    nodes {
      subspace {
        id
        type

        metadata {
          nodes {
            ${entityFragment}
          }
        }
      }
    }
  }
}`;

export type Subspace = OmitStrict<
  Space,
  | 'members'
  | 'createdAt'
  | 'editors'
  | 'isRootSpace'
  | 'mainVotingPluginAddress'
  | 'memberAccessPluginAddress'
  | 'personalSpaceAdminPluginAddress'
  | 'spacePluginAddress'
  | 'type'
>;

interface NetworkResult {
  spaceSubspaces: {
    nodes: {
      subspace: {
        id: string;
        type: GovernanceType;
        metadata: { nodes: SubstreamEntity[] };
      };
    }[];
  };
}

export async function fetchSubspacesBySpaceId(spaceId: string) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(spaceId),
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
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${endpoint}

            queryString: ${getFetchSpacesQuery(spaceId)}
            `,
            error.message
          );

          return {
            spaceSubspaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${endpoint}`);

          return {
            spaceSubspaces: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaceSubspaces.nodes.map((space): Subspace => {
    const spaceConfigWithImage = getSpaceConfigFromMetadata(space.subspace.id, space.subspace.metadata.nodes[0]);

    return {
      id: space.subspace.id,
      spaceConfig: spaceConfigWithImage,
    };
  });

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceConfig ? [s] : []));
}
