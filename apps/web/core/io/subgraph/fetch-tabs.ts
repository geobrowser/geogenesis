import { Schema } from '@effect/schema';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Entity, EntityDto } from '../dto/entities';
import { SubstreamEntity } from '../schema';
import { versionFragment } from './fragments';
import { graphql } from './graphql';

function getFetchTabsQuery(spaceId: string) {
  return `query {
    entities(
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
              }
            }
          }
        }
      }
      first: 1000
    ) {
      nodes {
        id
        currentVersion {
          version {
            ${versionFragment}
          }
        }
      }
    }
  }`;
}

export interface FetchTabsOptions {
  spaceId: string;
}

interface NetworkResult {
  entities: { nodes: SubstreamEntity[] };
}

export async function fetchTabs(options: FetchTabsOptions): Promise<Entity[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;
  const query = getFetchTabsQuery(options.spaceId);

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
            `Encountered runtime graphql error in fetchTab. queryId: ${queryId} ryString: ${getFetchTabsQuery(
              options.spaceId
            )}
          `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };

        default:
          console.error(`${error._tag}: Unable to fetch tabs, queryId: ${queryId} spaceId: ${options.spaceId}`);
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities: unknownEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const entities = unknownEntities.nodes
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamEntity)(e);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode tab ${e.id} with error ${error}`);
          return null;
        },
        onRight: entity => {
          return EntityDto(entity);
        },
      });
    })
    .filter(e => e !== null);

  return entities ?? [];
}
