import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '../environment';
import { graphql } from './subgraph/graphql';

function getFetchEntityTypeQuery(id: string) {
  return `query {
    entity(id: "${id}") {
      types {
        nodes {
          id
        }
      }
    }
  }
  `;
}

interface FetchEntityTypeOptions {
  id: string;
}

interface NetworkResult {
  entity: { types: { nodes: { id: string }[] } } | null;
}

export async function fetchEntityType(options: FetchEntityTypeOptions) {
  const queryId = uuid();
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchEntityTypeQuery(options.id),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchEntityType. queryId: ${queryId} ueryString: ${getFetchEntityTypeQuery(
              options.id
            )}
            `,
            error.message
          );

          return [];

        default:
          console.error(`${error._tag}: Unable to fetch entity type, queryId: ${queryId}`);

          return [];
      }
    }

    if (!resultOrError.right.entity) return [];
    return resultOrError.right.entity.types.nodes.map(node => node.id);
  });

  return await Effect.runPromise(graphqlFetchWithErrorFallbacks);
}
