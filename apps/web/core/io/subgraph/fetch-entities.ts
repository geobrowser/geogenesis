import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { FilterField, FilterState } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { SubstreamNetworkEntity, fromNetworkTriples } from './network-local-mapping';

function getFetchEntitiesQuery(
  query: string | undefined,
  entityOfWhere: string,
  typeIds?: string[],
  first = 100,
  skip = 0
) {
  const typeIdsString =
    typeIds && typeIds.length > 0
      ? `geoEntityTypesByEntityId: { some: { typeId: { in: [${typeIds?.map(t => `"${t}"`).join(', ')}] } } }`
      : // Filter out block entities by default
        `geoEntityTypesByEntityId: { every: { typeId: { notIn: ["${SYSTEM_IDS.TEXT_BLOCK}", "${SYSTEM_IDS.TABLE_BLOCK}", "${SYSTEM_IDS.IMAGE_BLOCK}", "${SYSTEM_IDS.INDEXED_SPACE}"] } } }`;

  const constructedWhere =
    entityOfWhere !== ''
      ? `{ name: { startsWithInsensitive: ${JSON.stringify(query)} }
        triplesByEntityId: {
          some: {
            ${entityOfWhere}
            isStale: { equalTo: false }
          }
        }
        ${typeIdsString}
      }`
      : `{name: {startsWithInsensitive: ${JSON.stringify(query)}} ${typeIdsString} }`;

  return `query {
    geoEntities(filter: ${constructedWhere} first: ${first} offset: ${skip} orderBy: NAME_ASC) {
      nodes {
        id
        name
        triplesByEntityId(filter: { isStale: { equalTo: false } }) {
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
  }`;
}

export interface FetchEntitiesOptions {
  query?: string;
  typeIds?: string[];
  spaceId?: string;
  first?: number;
  skip?: number;
  filter: FilterState;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  geoEntities: { nodes: SubstreamNetworkEntity[] };
}

export async function fetchEntities(options: FetchEntitiesOptions) {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const fieldFilters = Object.fromEntries(options.filter.map(clause => [clause.field, clause.value])) as Record<
    FilterField,
    string
  >;

  const entityOfWhere = [
    options.spaceId && `spaceId: { equalTo: ${JSON.stringify(options.spaceId)} }`,
    fieldFilters['entity-id'] && `id: ${JSON.stringify(fieldFilters['entity-id'])}`,
    fieldFilters['attribute-name'] &&
      `attribute: { name: {startsWithInsensitive: ${JSON.stringify(fieldFilters['attribute-name'])}} }`,
    fieldFilters['attribute-id'] && `attribute: { id: {equalTo: ${JSON.stringify(fieldFilters['attribute-id'])}} }`,

    // Until we have OR we can't search for name_contains OR value string contains
    fieldFilters.value && `entityValue: {name: {startsWithInsensitive: ${JSON.stringify(fieldFilters.value)}}}`,
    fieldFilters['linked-to'] && `entityValueId: {equalTo: ${JSON.stringify(fieldFilters['linked-to'])}}`,
  ]
    .filter(Boolean)
    .join(' ');

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchEntitiesQuery(options.query ?? '', entityOfWhere, options.typeIds, options.first, options.skip),
    signal: options?.signal,
  });

  if (options.query === 'supporting arguments')
    console.log(
      'query',
      getFetchEntitiesQuery(options.query ?? '', entityOfWhere, options.typeIds, options.first, options.skip)
    );

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
            `Encountered runtime graphql error in fetchEntities. queryId: ${queryId} ryString: ${getFetchEntitiesQuery(
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
            geoEntities: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch entities, queryId: ${queryId}query: ${options.query} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );
          return {
            geoEntities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { geoEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const sortedResults = sortSearchResultsByRelevance(geoEntities.nodes);

  return sortedResults.map(result => {
    const networkTriples = result.triplesByEntityId.nodes;

    // If there is no latest version just return an empty entity.
    if (networkTriples.length === 0) {
      return {
        id: result.id,
        name: result.name,
        description: null,
        nameTripleSpace: undefined,
        types: [],
        triples: [],
      };
    }

    const triples = fromNetworkTriples(networkTriples);
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

function sortSearchResultsByRelevance(startEntities: SubstreamNetworkEntity[]) {
  return startEntities.sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));
}
