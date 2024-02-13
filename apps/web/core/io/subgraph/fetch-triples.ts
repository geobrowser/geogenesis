import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { FilterField, FilterState } from '~/core/types';

import { graphql } from './graphql';
import { NetworkTriple, fromNetworkTriples } from './network-local-mapping';

interface GetFetchTriplesQueryOptions {
  where: string;
  skip: number;
  first: number;
}

const getFetchTriplesQuery = ({ where, skip, first }: GetFetchTriplesQueryOptions) => `query {
  triples(filter: {${where}}, first: ${first}, offset: ${skip}) {
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
}`;

export interface FetchTriplesOptions {
  query: string;
  space?: string;
  skip: number;
  first: number;
  filter: FilterState;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  triples: { nodes: NetworkTriple[] };
}

export async function fetchTriples(options: FetchTriplesOptions) {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const fieldFilters = Object.fromEntries(options.filter.map(clause => [clause.field, clause.value])) as Record<
    FilterField,
    string
  >;

  const where = [
    `isStale: { equalTo: false }`,
    options.space && `spaceId: { equalTo: ${JSON.stringify(options.space)} }`,
    // We can pass either `query` or `fieldFilters['entity-name']` to filter by entity name
    (options.query || fieldFilters['entity-name']) &&
      `entity: {name: {startsWithInsensitive: ${JSON.stringify(options.query ?? fieldFilters['entity-name'])}}}`,
    fieldFilters['entity-id'] && `entity: {id: {equalTo: ${JSON.stringify(fieldFilters['entity-id'])}}}`,
    fieldFilters['attribute-name'] &&
      `attribute: { name: {startsWithInsensitive: ${JSON.stringify(fieldFilters['attribute-name'])}} }`,
    fieldFilters['attribute-id'] && `attribute: { id: {equalTo: ${JSON.stringify(fieldFilters['attribute-id'])}} }`,

    // // Until we have OR we can't search for name_contains OR value string contains
    fieldFilters.value && `entity: {name: {startsWithInsensitive: ${JSON.stringify(fieldFilters.value)}}}`,
    fieldFilters['linked-to'] && `entityValueId: {equalTo: ${JSON.stringify(fieldFilters['linked-to'])}}`,
  ]
    .filter(Boolean)
    .join(' ');

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchTriplesQuery({ where, skip: options.skip, first: options.first }),
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
            `Encountered runtime graphql error in fetchTriples. queryId: ${queryId} endpoint: ${endpoint} space: ${
              options.space
            } query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}
            
            queryString: ${getFetchTriplesQuery({ where, skip: options.skip, first: options.first })}
            `,
            error.message
          );

          return { triples: { nodes: [] } };

        default:
          console.error(
            `${error._tag}: Unable to fetch triples, queryId: ${queryId} endpoint: ${endpoint} space: ${options.space} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );

          return { triples: { nodes: [] } };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  return fromNetworkTriples(result.triples.nodes);
}
