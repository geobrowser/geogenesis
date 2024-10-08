import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 } from 'uuid';

import { Environment } from '../environment';
import { Entity, EntityDto } from './dto/entities';
import { SubstreamEntity } from './schema';
import { versionFragment } from './subgraph/fragments';
import { graphql } from './subgraph/graphql';

const query = (ids: string[]) => {
  const stringifiedIds = JSON.stringify(ids);

  return `query {
    entities(filter: { id: { in: ${stringifiedIds} } }) {
      nodes {
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

export async function fetchBlocks(ids: string[]): Promise<Entity[]> {
  const queryId = v4();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(ids),
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
            `Encountered runtime graphql error in fetchBlocks. queryId: ${queryId} endpoint: ${endpoint} ids: ${ids}

            queryString: ${query(ids)}
            `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch fetch blocks, queryId: ${queryId} endpoint: ${endpoint} ids: ${ids}`
          );
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { entities: unknownEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return unknownEntities.nodes
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamEntity)(e);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode entity ${e.id} with error ${error}`);
          return null;
        },
        onRight: entity => {
          return EntityDto(entity);
        },
      });
    })
    .filter(e => e !== null);
}
