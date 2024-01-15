import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '../environment';
import { graphql } from './subgraph/graphql';

function getFetchEntityTypeQuery(id: string) {
  return `query {
    geoEntity(id: "${id}") {
      geoEntityTypesByEntityId {
        nodes {
          typeId
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
  geoEntity: { geoEntityTypesByEntityId: { nodes: { typeId: string }[] } } | null;
}

export async function fetchEntityType(options: FetchEntityTypeOptions) {
  const queryId = uuid();
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
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

    if (!resultOrError.right.geoEntity) return [];
    return resultOrError.right.geoEntity.geoEntityTypesByEntityId.nodes.map(node => node.typeId);
  });

  return await Effect.runPromise(graphqlFetchWithErrorFallbacks);
}
