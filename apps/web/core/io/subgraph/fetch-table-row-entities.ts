import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Entity, EntityDto } from '../dto/entities';
import { SubstreamEntity } from '../schema';
import { entityFragment } from './fragments';
import { graphql } from './graphql';

// this differs from the fetchEntities method in that we pass in a custom graphql string that represents
// the set of custom Table filters set on the table. These filters have small differences from the other
// types of filters we have in the app, so we are using a separate method to fetch them for now.
//
// Ideally we let the caller define the logic for fetching and handling the result, but for now we are
// following the pre-existing pattern.
function getFetchTableRowsQuery(filter: string, first = 100, skip = 0) {
  return `query {
    entities(filter: ${filter} first: ${first} offset: ${skip} orderBy: UPDATED_AT_DESC) {
      nodes {
        ${entityFragment}
      }
    }
  }`;
}

export interface FetchTableRowEntitiesOptions {
  first?: number;
  skip?: number;
  filter: string; // this is a graphql query string
  signal?: AbortController['signal'];
}

interface NetworkResult {
  entities: { nodes: SubstreamEntity[] };
}

export async function fetchTableRowEntities(options: FetchTableRowEntitiesOptions): Promise<Entity[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchTableRowsQuery(options.filter, options.first, options.skip),
    signal: options?.signal,
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
            `Encountered runtime graphql error in fetchTableRowEntities. queryId: ${queryId} skip: ${
              options.skip
            } first: ${options.first} filter: ${options.filter}

            queryString: ${getFetchTableRowsQuery(options.filter, options.first, options.skip)}
            `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch table row entities, queryId: ${queryId} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );

          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const decodedEntities = entities.nodes
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamEntity)(e);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode entity ${e.id} with error ${error}`);
          return null;
        },
        onRight: entity => {
          return entity;
        },
      });
    })
    .filter(e => e !== null);

  return decodedEntities.map(EntityDto);
}
