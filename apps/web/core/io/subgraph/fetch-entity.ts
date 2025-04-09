import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';
import { Entity } from '~/core/io/dto/entities';
import { SpaceId } from '~/core/types';

import { EntityDtoLive } from '../dto/entities';
import { SubstreamEntityLive } from '../schema';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

function getFetchEntityQuery(id: string, spaceId?: SpaceId) {
  return `query {
      entity(id: ${JSON.stringify(id)}) {
        id
        currentVersion {
          version {
            ${getEntityFragment({ spaceId })}
          }
        }
      }
    }`;
}
export interface FetchEntityOptions {
  spaceId?: SpaceId;
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  entity: SubstreamEntityLive | null;
}

export async function fetchEntity(options: FetchEntityOptions): Promise<Entity | null> {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchEntityQuery(options.id, options.spaceId),
    signal: options.signal,
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
            `Encountered runtime graphql error in fetchEntity. endpoint: ${endpoint} id: ${options.id}

            queryString: ${getFetchEntityQuery(options.id)}
            `,
            error.message
          );

          return {
            entity: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch entity, endpoint: ${endpoint} id: ${options.id}. ${error.message}`
          );
          return {
            entity: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const entity = result.entity;

  if (!entity) {
    return null;
  }

  const entityOrError = Schema.decodeEither(SubstreamEntityLive)(entity);

  const decodedEntity = Either.match(entityOrError, {
    onLeft: error => {
      console.error(`Unable to decode entity ${entity.id} with error ${error}`);
      return null;
    },
    onRight: entity => {
      return entity;
    },
  });

  if (decodedEntity === null) {
    return null;
  }

  return EntityDtoLive(decodedEntity);
}
