import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { SearchResult } from '~/core/v2.types';

import { SearchResultDto } from '../dto/search';
import { SubstreamSearchResult } from '../schema';
import { resultEntityFragment } from './fragments';
import { graphql } from './graphql';

function getFetchResultQuery(id: string) {
  return `query {
    entity(id: ${JSON.stringify(id)}) {
      id
      currentVersion {
        version {
          ${resultEntityFragment}
        }
      }
    }
  }`;
}

export interface FetchResultOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  entity: SubstreamSearchResult | null;
}

export async function fetchResult(options: FetchResultOptions): Promise<SearchResult | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchResultQuery(options.id),
    signal: options.signal,
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* () {
    const resultOrError = yield* Effect.either(graphqlFetchEffect);

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
            `Encountered runtime graphql error in fetchResult. id: ${options.id}

            queryString: ${getFetchResultQuery(options.id)}
            `,
            error.message
          );

          return {
            entity: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch result, queryId: ${queryId} endpoint: ${endpoint} id: ${options.id}`
          );
          return {
            entity: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const entity = result.entity;

  if (!entity) {
    return null;
  }

  const entityOrError = Schema.decodeEither(SubstreamSearchResult)(entity);

  const decodedResult = Either.match(entityOrError, {
    onLeft: error => {
      console.error(`Unable to decode search result: ${String(error)}`);
      return null;
    },
    onRight: result => {
      return SearchResultDto(result);
    },
  });

  if (decodedResult === null) {
    return null;
  }

  return decodedResult;
}
