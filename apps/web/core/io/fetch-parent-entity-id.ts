import { Effect, Either } from 'effect';
import { v4 } from 'uuid';

import { EntityId } from '~/core/io/substream-schema';
import { validateEntityId } from '~/core/utils/utils';

import { Environment } from '../environment';
import { graphql } from './subgraph/graphql';

const query = (blockId: string) => {
  return `query {
    entities(
      filter: {currentVersion: {version: {relationsByFromVersionId: {some: {toVersion: {entityId: {equalTo: "${blockId}"}}}}}}}
      first: 1
    ) {
      nodes {
        id
      }
    }
  }`;
};

export async function fetchParentEntityId(blockId: string): Promise<EntityId | null> {
  const queryId = v4();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<{ entities: { nodes: [{ id: string }] } }>({
    endpoint,
    query: query(blockId),
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
            `Encountered runtime graphql error in fetchParentEntityId. queryId: ${queryId} endpoint: ${endpoint} blockId: ${blockId}

            queryString: ${query(blockId)}
            `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch fetch parent entity id, queryId: ${queryId} endpoint: ${endpoint} blockId: ${blockId}`
          );
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities: unknownEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const unknownParentEntityId = unknownEntities?.nodes?.[0]?.id;
  const parentEntityId = validateEntityId(unknownParentEntityId) ? EntityId(unknownParentEntityId) : null;

  return parentEntityId;
}
