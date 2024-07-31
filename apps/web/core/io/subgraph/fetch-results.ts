import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Result, SearchResultDto } from '../dto/search';
import { SubstreamSearchResult } from '../schema';
import { resultEntityFragment } from './fragments';
import { graphql } from './graphql';

function getFetchResultsQuery(
  query: string | undefined,
  entityOfWhere: string,
  typeIds?: string[],
  first = 100,
  skip = 0
) {
  const typeIdsString =
    typeIds && typeIds.length > 0
      ? `entityTypes: { some: { typeId: { in: [${typeIds?.map(t => `"${t}"`).join(', ')}] } } }`
      : // Filter out block entities by default
        `entityTypes: { every: { typeId: { notIn: ["${SYSTEM_IDS.TEXT_BLOCK}", "${SYSTEM_IDS.TABLE_BLOCK}", "${SYSTEM_IDS.IMAGE_BLOCK}", "${SYSTEM_IDS.INDEXED_SPACE}"] } } }`;

  const constructedWhere =
    entityOfWhere !== ''
      ? `{ name: { startsWithInsensitive: ${JSON.stringify(query)} }
        triples: {
          some: {
            ${entityOfWhere}
            isStale: { equalTo: false }
          }
        }
        ${typeIdsString}
      }`
      : `{name: {startsWithInsensitive: ${JSON.stringify(query)}} ${typeIdsString} }`;

  return `query {
    entities(filter: ${constructedWhere} first: ${first} offset: ${skip} orderBy: NAME_ASC) {
      nodes {
        ${resultEntityFragment}
      }
    }
  }`;
}

export interface FetchResultsOptions {
  query?: string;
  typeIds?: string[];
  spaceId?: string;
  first?: number;
  skip?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  entities: { nodes: SubstreamSearchResult[] };
}

export async function fetchResults(options: FetchResultsOptions): Promise<Result[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const entityOfWhere = [options.spaceId && `spaceId: { equalTo: ${JSON.stringify(options.spaceId)} }`]
    .filter(Boolean)
    .join(' ');

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchResultsQuery(options.query ?? '', entityOfWhere, options.typeIds, options.first, options.skip),
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
            `Encountered runtime graphql error in fetchResults. queryId: ${queryId} ryString: ${getFetchResultsQuery(
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
            entities: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch results, queryId: ${queryId}query: ${options.query} skip: ${options.skip} first: ${options.first}`
          );
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const sortedResults = sortSearchResultsByRelevance(entities.nodes);
  return sortedResults.map(SearchResultDto);
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

function sortSearchResultsByRelevance(startEntities: SubstreamSearchResult[]) {
  return startEntities.sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));
}
