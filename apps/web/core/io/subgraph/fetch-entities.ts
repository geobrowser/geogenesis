import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Entity as IEntity } from '~/core/types';
import { FilterField, FilterState } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { NetworkEntity, fromNetworkTriples } from './network-local-mapping';

function getFetchEntitiesQuery(
  query: string | undefined,
  entityOfWhere: string,
  typeIds?: string[],
  first = 100,
  skip = 0
) {
  const typeIdsString =
    typeIds && typeIds.length > 0 ? `typeIds_contains_nocase: [${typeIds?.map(t => `"${t}"`).join(', ')}]` : '';

  const constructedWhere = {
    start: `{name_starts_with_nocase: ${JSON.stringify(query)}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}`,
  };

  // If there are multiple TypeIds we need to build an OR query for each one. Each query in the OR
  // filter will contain the `query` and `entityOfWhere` params. We need to do this because there is
  // no where filter like "typeIds_contains_any_nocase."
  if (typeIds && typeIds.length > 1) {
    const whereStartsWithMultipleTypeIds = [];
    const whereContainsMultipleTypeIds = [];

    for (const id of typeIds) {
      whereStartsWithMultipleTypeIds.push(
        `typeIds_contains_nocase: ["${id}"], name_starts_with_nocase: ${JSON.stringify(
          query
        )}, entityOf_: {${entityOfWhere}}`
      );

      whereContainsMultipleTypeIds.push(
        `typeIds_contains_nocase: ["${id}"], name_contains_nocase: ${JSON.stringify(
          query
        )}, entityOf_: {${entityOfWhere}}`
      );
    }

    const multiFilterStartsWithQuery = whereStartsWithMultipleTypeIds.map(f => `{${f}}`).join(', ');

    constructedWhere.start = `{or: [${multiFilterStartsWithQuery}]}`;
  }

  return `query {
    startEntities: geoEntities(where: ${constructedWhere.start}, first: ${first}, skip: ${skip}, orderBy: name) {
      id,
      name
      entityOf {
        id
        stringValue
        valueId
        valueType
        numberValue
        space {
          id
        }
        entityValue {
          id
          name
        }
        attribute {
          id
          name
        }
        entity {
          id
          name
        }
      }
    }
  }`;
}

export interface FetchEntitiesOptions {
  endpoint: string;
  query?: string;
  typeIds?: string[];
  first?: number;
  skip?: number;
  filter: FilterState;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  startEntities: NetworkEntity[];
  containEntities: NetworkEntity[];
}

export async function fetchEntities(options: FetchEntitiesOptions) {
  const queryId = uuid();

  const fieldFilters = Object.fromEntries(options.filter.map(clause => [clause.field, clause.value])) as Record<
    FilterField,
    string
  >;

  const entityOfWhere = [
    fieldFilters['entity-id'] && `id: ${JSON.stringify(fieldFilters['entity-id'])}`,
    fieldFilters['attribute-name'] &&
      `attribute_: {name_contains_nocase: ${JSON.stringify(fieldFilters['attribute-name'])}}`,
    fieldFilters['attribute-id'] && `entityOf_: {attribute: ${JSON.stringify(fieldFilters['attribute-id'])}}`,

    // Until we have OR we can't search for name_contains OR value string contains
    fieldFilters.value && `entityValue_: {name_contains_nocase: ${JSON.stringify(fieldFilters.value)}}`,
    fieldFilters['linked-to'] && `valueId: ${JSON.stringify(fieldFilters['linked-to'])}`,
  ]
    .filter(Boolean)
    .join(' ');

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchEntitiesQuery(options.query, entityOfWhere, options.typeIds, options.first, options.skip),
    signal: options?.signal,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
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
            `Encountered runtime graphql error in fetchEntities. queryId: ${queryId} endpoint: ${
              options.endpoint
            } query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}

          queryString: ${getFetchEntitiesQuery(
            options.query,
            entityOfWhere,
            options.typeIds,
            options.first,
            options.skip
          )}
          `,
            error.message
          );

          return {
            startEntities: [],
            containEntities: [],
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch entities, queryId: ${queryId} endpoint: ${options.endpoint} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );
          return {
            startEntities: [],
            containEntities: [],
          };
      }
    }

    return resultOrError.right;
  });

  const { startEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const sortedResultsWithTypesAndDescription: IEntity[] = startEntities.map(result => {
    const triples = fromNetworkTriples(result.entityOf);
    const nameTriple = Entity.nameTriple(triples);

    return {
      id: result.id,
      name: result.name,
      description: Entity.description(triples),
      nameTripleSpace: nameTriple?.space,
      types: Entity.types(triples, nameTriple?.space),
      triples,
    };
  });

  // We filter block entities so we don't clutter entity search results with block entities.
  // Eventually we might want to let the caller handle the filtering instead of doing it
  // at the network level here.
  //
  // We could also do this filter at the top of the algorithm so we don't apply the extra
  // transformations onto entities that we are going to filter out.
  return sortedResultsWithTypesAndDescription.filter(result => {
    return !result.types.some(
      t =>
        t.id === SYSTEM_IDS.TEXT_BLOCK ||
        t.id === SYSTEM_IDS.TABLE_BLOCK ||
        t.id === SYSTEM_IDS.IMAGE_BLOCK ||
        t.id === SYSTEM_IDS.INDEXED_SPACE
    );
  });
}
