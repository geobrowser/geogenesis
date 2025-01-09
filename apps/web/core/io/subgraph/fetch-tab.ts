import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

function getFetchTabEntityIdQuery(spaceId: string, pageTypeEntityId: string) {
  return `query {
    entities(
      orderBy: CREATED_AT_BLOCK_ASC,
      filter: {
        currentVersion: {
          version: {
            versionSpaces: {
              some: { spaceId: { equalTo: "${spaceId}" } }
            }
            relationsByFromVersionId: {
              some: {
                typeOf: {
                  entityId: { equalTo: "${SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE}" }
                }
                toVersion: {
                  entityId: { equalTo: "${pageTypeEntityId}" }
                }
              }
            }
          }
        }
      }
      first: 1
    ) {
      nodes {
        id
      }
    }
  }`;
}

export interface FetchTabEntityIdOptions {
  spaceId: string;
  pageTypeEntityId: string;
}

interface NetworkResult {
  entities: { nodes: { id: string }[] };
}

export async function fetchTabEntityId(options: FetchTabEntityIdOptions): Promise<string | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;
  const query = getFetchTabEntityIdQuery(options.spaceId, options.pageTypeEntityId);

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query,
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
            `Encountered runtime graphql error in fetchTab. queryId: ${queryId} ryString: ${getFetchTabEntityIdQuery(
              options.spaceId,
              options.pageTypeEntityId
            )}
          `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch entities, queryId: ${queryId} spaceId: ${options.spaceId} pageTypeEntityId: ${options.pageTypeEntityId}`
          );
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return entities.nodes?.[0]?.id ?? null;
}
