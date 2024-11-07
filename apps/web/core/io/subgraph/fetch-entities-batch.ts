import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 } from 'uuid';

import { Environment } from '~/core/environment';

import { Entity, EntityDto } from '../dto/entities';
import { SubstreamEntity } from '../schema';
import { versionFragment } from './fragments';
import { graphql } from './graphql';

const query = (entityIds: string[]) => {
  return `query {
    entities(
      filter: { id: { in: ${JSON.stringify(entityIds)} } }
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
};

interface NetworkResult {
  entities: { nodes: SubstreamEntity[] };
}

export async function fetchEntitiesBatch(entityIds: string[], signal?: AbortController['signal']): Promise<Entity[]> {
  const queryId = v4();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: query(entityIds),
    signal,
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
            `Encountered runtime graphql error in fetchCollectionItemEntities. queryId: ${queryId}
            queryString: ${query(entityIds)}
            `,
            error.message
          );

          return [];

        default:
          console.error(`${error._tag}: Unable to fetch table collection item entities, queryId: ${queryId}`);
          return [];
      }
    }

    return resultOrError.right.entities.nodes;
  });

  const unknownEntities = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return unknownEntities
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamEntity)(e);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode collection item entity ${e.id} with error ${error}`);
          return null;
        },
        onRight: entity => {
          return EntityDto(entity);
        },
      });
    })
    .filter(e => e !== null);
}
