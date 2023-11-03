import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { graphql } from './graphql';
import { NetworkEntity } from './network-local-mapping';

const getFetchSubspacesQuery = (entityId: string) => `query {
  geoEntities(
    where: {typeIds_contains_nocase: ["${SYSTEM_IDS.SPACE_CONFIGURATION}"], entityOf_: {attribute: "${SYSTEM_IDS.BROADER_SPACES}", entityValue: "${entityId}"}}
  ) {
    id
    name
  }
}`;

export interface FetchSubspacesOptions {
  entityId: string;
  endpoint: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  geoEntities: NetworkEntity[];
}

export async function fetchSubspaces(options: FetchSubspacesOptions) {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchSubspacesQuery(options.entityId),
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
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${options.endpoint}

            queryString: ${getFetchSubspacesQuery(options.entityId)}
            `,
            error.message
          );

          return {
            geoEntities: [],
          };

        default:
          console.error(`${error._tag}: Unable to fetch subspaces, queryId: ${queryId} endpoint: ${options.endpoint}`);

          return {
            geoEntities: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const subspaces = result.geoEntities;

  return subspaces;
}
