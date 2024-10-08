import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { SpaceGovernanceType } from '~/core/types';

import { Subspace, SubspaceDto } from '../dto/subspaces';
import { SubstreamEntity, SubstreamSubspace } from '../schema';
import { versionFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpacesQuery = (spaceId: string) => `query {
  spaceSubspaces(filter: { parentSpaceId: { equalTo: "${spaceId}" } }) {
    nodes {
      subspace {
        id
        daoAddress
        type

        spaceMembers {
          totalCount
        }

        spaceEditors {
          totalCount
        }

        spacesMetadata {
          nodes {
            entity {
              currentVersion {
                version {
                  ${versionFragment}
                }
              }
            }
          }
        }
      }
    }
  }
}`;

interface NetworkResult {
  spaceSubspaces: {
    nodes: {
      subspace: {
        id: string;
        type: SpaceGovernanceType;
        daoAddress: string;
        spaceEditors: { totalCount: number };
        spaceMembers: { totalCount: number };
        spacesMetadata: { nodes: { entity: SubstreamEntity }[] };
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
            `Encountered runtime graphql error in fetchSubspaces. queryId: ${queryId} endpoint: ${endpoint}

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

  const spaces = result.spaceSubspaces.nodes
    .map((space): Subspace | null => {
      const decodedSpace = Schema.decodeEither(SubstreamSubspace)(space.subspace);

      const result = Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Encountered error decoding subspace for space with id ${spaceId} – error: ${error}`);
          return null;
        },
        onRight: space => {
          return space;
        },
      });

      if (result === null) {
        return null;
      }

      return SubspaceDto(result);
    })
    .filter(s => s !== null);

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceConfig ? [s] : []));
}
