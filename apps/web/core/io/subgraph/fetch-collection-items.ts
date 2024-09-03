import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 } from 'uuid';

import { Environment } from '~/core/environment';

import { Entity, EntityDto } from '../dto/entities';
import { SubstreamEntity } from '../schema';
import { entityFragment } from './fragments';
import { graphql } from './graphql';

const query = (collectionId: string) => {
  return `{
      relations(filter: {fromEntityId: "${collectionId}"}) {
        nodes {
          entity {
            ${entityFragment}
          }
        }
      }
    }`;
};

export async function fetchCollectionItemEntities(
  collectionId: string,
  signal?: AbortController['signal']
): Promise<Entity[]> {
  const queryId = v4();

  const graphqlFetchEffect = graphql<{
    relations: { nodes: { entity: SubstreamEntity }[] };
  }>({
    endpoint: Environment.getConfig().api,
    query: query(collectionId),
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
            `Encountered runtime graphql error in fetchCollectionItemEntities. queryId: ${queryId} collectionId: ${collectionId}

            queryString: ${query(collectionId)}
            `,
            error.message
          );

          return [];

        default:
          console.error(
            `${error._tag}: Unable to fetch table collection item entities, queryId: ${queryId} collectionId: ${collectionId}`
          );

          return [];
      }
    }

    return resultOrError.right.relations.nodes
      .map(e => {
        const decodedSpace = Schema.decodeEither(SubstreamEntity)(e.entity);

        return Either.match(decodedSpace, {
          onLeft: error => {
            console.error(`Unable to decode entity ${e.entity.id} for collection ${collectionId} with error ${error}`);
            return null;
          },
          onRight: entity => {
            return EntityDto(entity);
          },
        });
      })
      .filter(e => e !== null);
  });

  // @TODO: Merge
  return await Effect.runPromise(graphqlFetchWithErrorFallbacks);
}
