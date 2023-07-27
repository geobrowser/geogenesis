import { Effect } from 'effect';

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

type NetworkResult = {
  data: {
    triples: NetworkTriple[];
  };
  errors: unknown[];
};
export async function fetchTriples(options: FetchTriplesOptions) {
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

  // @TODO: Catch by known tag and unexpected errors
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch triples, endpoint: ${options.endpoint} space: ${options.space} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
      );
      return Effect.succeed({
        data: {
          triples: [],
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  // @TODO: Fallback
  // @TODO: runtime validation of types
  // @TODO: log fail states
  if (result.errors) {
    return [];
  }

  return fromNetworkTriples(result.data.triples.filter(triple => !triple.isProtected));
}
