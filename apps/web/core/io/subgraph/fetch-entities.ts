import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect } from 'effect';
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
    contain: `{name_contains_nocase: ${JSON.stringify(query)}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}`,
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
    const multiFilterContainsQuery = whereContainsMultipleTypeIds.map(f => `{${f}}`).join(', ');

    constructedWhere.start = `{or: [${multiFilterStartsWithQuery}]}`;
    constructedWhere.contain = `{or: [${multiFilterContainsQuery}]}`;
  }

  return `query {
    startEntities: geoEntities(where: ${constructedWhere.start}, first: ${first}, skip: ${skip}) {
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
    containEntities: geoEntities(where: ${constructedWhere.contain}, first: ${first}, skip: ${skip}) {
      id,
      name,
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
  abortController?: AbortController;
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
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchTag('GraphqlRuntimeError', error => {
      console.error(
        `Encountered runtime graphql error in fetchEntities. queryId: ${queryId} endpoint: ${options.endpoint} query: ${
          options.query
        } skip: ${options.skip} first: ${options.first} filter: ${options.filter}
      
      queryString: ${getFetchEntitiesQuery(options.query, entityOfWhere, options.typeIds, options.first, options.skip)}
      `,
        error.message
      );
      return Effect.succeed({
        startEntities: [],
        containEntities: [],
      });
    }),
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch entities, queryId: ${queryId} endpoint: ${options.endpoint} query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
      );
      return Effect.succeed({
        startEntities: [],
        containEntities: [],
      });
    })
  );

  const { startEntities, containEntities } = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  const sortedResults = sortSearchResultsByRelevance(startEntities, containEntities);

  const sortedResultsWithTypesAndDescription: IEntity[] = sortedResults.map(result => {
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
    return !(
      result.types.some(t => t.id === SYSTEM_IDS.TEXT_BLOCK) ||
      result.types.some(t => t.id === SYSTEM_IDS.TABLE_BLOCK) ||
      result.types.some(t => t.id === SYSTEM_IDS.IMAGE_BLOCK)
    );
  });
}

const sortLengthThenAlphabetically = (a: string | null, b: string | null) => {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  if (a.length === b.length) {
    return a.localeCompare(b);
  }
  return a.length - b.length;
};

function sortSearchResultsByRelevance(startEntities: NetworkEntity[], containEntities: NetworkEntity[]) {
  // TODO: This is where it's breaking
  const startEntityIds = startEntities.map(entity => entity.id);

  const primaryResults = startEntities.sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));
  const secondaryResults = containEntities
    .filter(entity => !startEntityIds.includes(entity.id))
    .sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));

  return [...primaryResults, ...secondaryResults];
}
