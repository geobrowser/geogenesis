import { Schema } from '@effect/schema';
import { SystemIds } from '@graphprotocol/grc-20';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { SearchResult, SearchResultDto } from '../dto/search';
import { SubstreamSearchResult } from '../schema';
import { resultEntityFragment } from './fragments';
import { graphql } from './graphql';

function getFetchResultsQuery(query: string | undefined, typeIds?: string[], spaceId?: string, first = 100, skip = 0) {
  const typeIdsString =
    typeIds && typeIds.length > 0
      ? `versionTypes: {
            some: { type: { entityId: { in: ["${typeIds.join('","')}"] } } }
          }`
      : // Filter out block entities by default
        `versionTypes: { every: { type: { entityId: { notIn: ["${SystemIds.TEXT_BLOCK}", "${SystemIds.DATA_BLOCK}", "${SystemIds.IMAGE_BLOCK}", "${SystemIds.PAGE_TYPE}"] } } } }`;

  const spaceIdString = spaceId
    ? `versionSpaces: {
        some: { spaceId: { equalTo: "${spaceId}" } }
      }`
    : ``;

  const constructedWhere = `{
  name: {
    isNull: false
  } ${typeIdsString} ${spaceIdString} }`;

  const fetchResultsQuery = `query {
    searchEntitiesFuzzy(searchTerm: ${JSON.stringify(query?.split(' ').join('&'))}, filter: {
        currentVersion: {
          version: ${constructedWhere}
        }
      }
      first: ${first} offset: ${skip}
    ) {
      nodes {
       id
        currentVersion {
          version {
            ${resultEntityFragment}
          }
        }
      }
    }
  }`;

  return fetchResultsQuery;
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
  searchEntitiesFuzzy: { nodes: SubstreamSearchResult[] };
}

export async function fetchResults(options: FetchResultsOptions): Promise<SearchResult[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchResultsQuery(options.query ?? '', options.typeIds, options.spaceId, options.first, options.skip),
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
              options.typeIds,
              options.spaceId,
              options.first,
              options.skip
            )}
          `,
            error.message
          );

          return {
            searchEntitiesFuzzy: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch results, queryId: ${queryId}query: ${options.query} skip: ${options.skip} first: ${options.first}`
          );
          return {
            searchEntitiesFuzzy: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { searchEntitiesFuzzy } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return searchEntitiesFuzzy.nodes
    .map(result => {
      const decodedResult = Schema.decodeEither(SubstreamSearchResult)(result);

      return Either.match(decodedResult, {
        onLeft: error => {
          console.error(`Unable to decode search result: ${String(error)}`);
          return null;
        },
        onRight: result => {
          return SearchResultDto(result);
        },
      });
    })
    .filter(s => s !== null);
}
