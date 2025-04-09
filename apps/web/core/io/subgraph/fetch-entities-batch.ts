import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { queryClient } from '~/core/query-client';
import { SpaceId } from '~/core/types';

import { Entity, EntityDtoLive } from '../dto/entities';
import { SubstreamEntityLive } from '../schema';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

type FetchEntitiesBatchCachedOptions = {
  spaceId?: SpaceId;
  entityIds: string[];
  filterString?: string;
};

export async function fetchEntitiesBatchCached(options: FetchEntitiesBatchCachedOptions) {
  const { spaceId, entityIds, filterString } = options;

  return queryClient.fetchQuery({
    queryKey: ['entities-batch', spaceId, entityIds, filterString],
    queryFn: () => fetchEntitiesBatch(options),
  });
}

const query = (entityIds: string[], filterString?: string, spaceId?: string) => {
  const filter = filterString
    ? `currentVersion: {
        version: {
          ${filterString}
        }
      }`
    : '';

  return `query {
    entities(
      filter: { id: { in: ${JSON.stringify(entityIds)} } ${filter} }
    ) {
      nodes {
        id
        currentVersion {
          version {
            ${getEntityFragment(spaceId ? { spaceId } : {})}
          }
        }
      }
    }
  }`;
};

interface NetworkResult {
  entities: { nodes: SubstreamEntityLive[] };
}

type FetchEntitiesBatchOptions = {
  spaceId?: SpaceId;
  entityIds: string[];
  filterString?: string;
  signal?: AbortController['signal'];
};

export async function fetchEntitiesBatch(options: FetchEntitiesBatchOptions): Promise<Entity[]> {
  const { spaceId, entityIds, filterString, signal } = options;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: query(entityIds, filterString, spaceId),
    signal,
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
            `Encountered runtime graphql error in fetchEntitiesBatch. queryId: ${queryId}
            queryString: ${query(entityIds)}
            `,
            error.message
          );

          return [];

        default:
          console.error(`${error._tag}: Unable to fetch entities, queryId: ${queryId}. ${String(error)}`);
          return [];
      }
    }

    return resultOrError.right.entities.nodes;
  });

  const unknownEntities = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return unknownEntities
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamEntityLive)(e);

      return Either.match(decodedSpace, {
        onLeft: () => {
          return null;
        },
        onRight: substreamEntity => {
          const entity = EntityDtoLive(substreamEntity);

          return entity;
        },
      });
    })
    .filter(e => e !== null);
}
