import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { FilterField, FilterState } from '~/core/types';

import { graphql } from './graphql';
import { NetworkTriple, fromNetworkTriples } from './network-local-mapping';

interface GetFetchTriplesQueryOptions {
  where: string;
  skip: number;
  first: number;
}

const getFetchTriplesQuery = ({ where, skip, first }: GetFetchTriplesQueryOptions) => `query {
  triples(where: {${where}}, skip: ${skip}, first: ${first}) {
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
}`;

export interface FetchTriplesOptions {
  endpoint: string;
  query: string;
  space?: string;
  skip: number;
  first: number;
  filter: FilterState;
  abortController?: AbortController;
}

interface NetworkResult {
  triples: NetworkTriple[];
}

export async function fetchTriples(options: FetchTriplesOptions) {
  const queryId = uuid();

  const fieldFilters = Object.fromEntries(options.filter.map(clause => [clause.field, clause.value])) as Record<
    FilterField,
    string
  >;

  const where = [
    options.space && `space: ${JSON.stringify(options.space)}`,
    // We can pass either `query` or `fieldFilters['entity-name']` to filter by entity name
    (options.query || fieldFilters['entity-name']) &&
      `entity_: {name_contains_nocase: ${JSON.stringify(options.query || fieldFilters['entity-name'])}}`,
    fieldFilters['entity-id'] && `entity: ${JSON.stringify(fieldFilters['entity-id'])}`,
    fieldFilters['attribute-name'] &&
      `attribute_: {name_contains_nocase: ${JSON.stringify(fieldFilters['attribute-name'])}}`,
    fieldFilters['attribute-id'] && `attribute: ${JSON.stringify(fieldFilters['attribute-id'])}`,

    // Until we have OR we can't search for name_contains OR value string contains
    fieldFilters.value && `entityValue_: {name_contains_nocase: ${JSON.stringify(fieldFilters.value)}}`,
    fieldFilters['linked-to'] && `valueId: ${JSON.stringify(fieldFilters['linked-to'])}`,
  ]
    .filter(Boolean)
    .join(' ');

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchTriplesQuery({ where, skip: options.skip, first: options.first }),
    abortController: options.abortController,
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchTriples. queryId: ${queryId} endpoint: ${
              options.endpoint
            } space: ${options.space} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${
              options.filter
            }
            
            queryString: ${getFetchTriplesQuery({ where, skip: options.skip, first: options.first })}
            `,
            error.message
          );

          return { triples: [] };

        default:
          console.error(
            `${error._tag}: Unable to fetch triples, queryId: ${queryId} endpoint: ${options.endpoint} space: ${options.space} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );

          return { triples: [] };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  return fromNetworkTriples(result.triples.filter(triple => !triple.isProtected));
}
