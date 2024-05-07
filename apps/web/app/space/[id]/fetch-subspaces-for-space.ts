import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamEntity, getSpaceConfigFromMetadata } from '~/core/io/subgraph/network-local-mapping';
import { SpaceWithMetadata } from '~/core/types';

const getFetchSpacesQuery = (spaceId: string) => `query {
  spaceSubspaces(filter: { parentSpaceId: { equalTo: "${spaceId}" } }) {
    totalCount
    nodes {
      subspace {
        id

        spaceMembers {
          totalCount
        }

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
    }
  }
}`;

interface NetworkSubspace {
  id: string;
  spaceMembers: { totalCount: number };
  metadata: { nodes: SubstreamEntity[] };
}

interface NetworkResult {
  spaceSubspaces: {
    totalCount: number;
    nodes: NetworkSubspace[];
  };
}

interface Subspace {
  id: string;
  totalMembers: number;
  spaceConfig: SpaceWithMetadata | null;
}

export async function getSubspacesForSpace(spaceId: string) {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

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
            spaceSubspaces: { totalCount: 0, nodes: [] },
          };
        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${endpoint}`);

          return {
            spaceSubspaces: { totalCount: 0, nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaceSubspaces.nodes.map((space): Subspace => {
    const spaceConfigWithImage = getSpaceConfigFromMetadata(space.metadata.nodes[0]);

    return {
      id: space.id,
      spaceConfig: spaceConfigWithImage,
      totalMembers: space.spaceMembers.totalCount,
    };
  });

  return {
    totalCount: result.spaceSubspaces.totalCount,
    subspaces: spaces,
  };
}
