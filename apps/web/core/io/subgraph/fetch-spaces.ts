import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Space, SpaceDto } from '../dto/spaces';
import { SubstreamSpace } from '../schema';
import { spaceFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpacesQuery = (spaceIds?: string[]) => {
  if (spaceIds) {
    return `query {
      spaces(filter: { id: { in: ${JSON.stringify(spaceIds)} } }) {
        nodes {
          ${spaceFragment}
        }
      }
    }`;
  }

  return `query {
    spaces(filter: { spacePluginAddress: { isNull: false } }) {
      nodes {
        ${spaceFragment}
      }
    }
  }`;
};

interface NetworkResult {
  spaces: {
    nodes: SubstreamSpace[];
  };
}

interface FetchSpacesArgs {
  spaceIds: string[];
}

export async function fetchSpaces(args?: FetchSpacesArgs): Promise<Space[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(args?.spaceIds),
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

            queryString: ${getFetchSpacesQuery()}
            `,
            error.message
          );

          return {
            spaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${endpoint}`);

          return {
            spaces: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaces.nodes
    .map(space => {
      const decodedSpace = Schema.decodeEither(SubstreamSpace)(space);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode space. spaceId: ${space.id} ${String(error)}`);
          return null;
        },
        onRight: space => {
          return SpaceDto(space);
        },
      });
    })
    .filter(space => space !== null);

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.entity ? [s] : []));
}
