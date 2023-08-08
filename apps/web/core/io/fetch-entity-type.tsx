import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { graphql } from './subgraph/graphql';

function getFetchEntityTypeQuery(id: string) {
  return `query {
    geoEntity(id: "${id}") {
      typeIds
    }
  }
  `;
}

interface FetchEntityTypeOptions {
  endpoint: string;
  id: string;
}

interface NetworkResult {
  geoEntity: { typeIds: string[] } | null;
}

export async function fetchEntityType(options: FetchEntityTypeOptions) {
  const queryId = uuid();
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchEntityTypeQuery(options.id),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchEntityType. queryId: ${queryId} endpoint: ${
              options.endpoint
            } entityId: ${options.id}
            
            queryString: ${getFetchEntityTypeQuery(options.id)}
            `,
            error.message
          );

          return [];

        default:
          console.error(
            `${error._tag}: Unable to fetch entity type, queryId: ${queryId} endpoint: ${options.endpoint} entityId: ${options.id}`
          );

          return [];
      }
    }

    if (!resultOrError.right.geoEntity) return [];
    return resultOrError.right.geoEntity.typeIds;
  });

  return await Effect.runPromise(graphqlFetchWithErrorFallbacks);
}
