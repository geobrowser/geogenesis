import { Schema } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '../environment';
import { slog } from '../utils/utils';
import { SubstreamType, SubstreamVersionTypes } from './schema';
import { versionTypesFragment } from './subgraph/fragments';
import { graphql } from './subgraph/graphql';

function getFetchEntityTypeQuery(id: string) {
  return `query {
    entity(id: "${id}") {
      id
      currentVersion {
        version {
          ${versionTypesFragment}
        }
      }
    }
  }`;
}

interface FetchEntityTypeOptions {
  id: string;
}

interface NetworkResult {
  entity: { currentVersion: { version: { versionTypes: { nodes: { type: SubstreamType }[] } } } } | null;
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

          return {
            entity: null,
          };

        default:
          console.error(`${error._tag}: Unable to fetch entity type, queryId: ${queryId}`);

          return {
            entity: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!result) {
    return [];
  }

  if (!result.entity) {
    return [];
  }

  const decodeEntityTypes = Schema.decodeEither(SubstreamVersionTypes)(
    result.entity.currentVersion.version.versionTypes
  );

  if (Either.isLeft(decodeEntityTypes)) {
    slog({
      message: `Unable to decode entity types for entity ${options.id}`,
      requestId: queryId,
      level: 'error',
    });
    return [];
  }

  return decodeEntityTypes.right.nodes.map(node => node.type.id);
}
