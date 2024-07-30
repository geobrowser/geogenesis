import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Entity as IEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { entityFragment, tripleFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples } from './network-local-mapping';

function getFetchEntityQuery(id: string) {
  return `query {
    entity(id: ${JSON.stringify(id)}) {
      ${entityFragment}
    }
  }`;
}

export interface FetchEntityOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  entity: SubstreamEntity | null;
}

export async function fetchEntity(options: FetchEntityOptions): Promise<IEntity | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchEntityQuery(options.id),
    signal: options.signal,
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
            `Encountered runtime graphql error in fetchEntity. queryId: ${queryId} endpoint: ${endpoint} id: ${
              options.id
            }

            queryString: ${getFetchEntityQuery(options.id)}
            `,
            error.message
          );

          return {
            entity: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch entity, queryId: ${queryId} endpoint: ${endpoint} id: ${options.id}`
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

  const networkTriples = entity.triples.nodes;
  const triples = fromNetworkTriples(networkTriples);
  const nameTriples = Entities.nameTriples(triples);

  console.log('relations', entity.relationsByFromEntityId.nodes);

  return {
    id: entity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    types: entity.types.nodes,
    relationsOut: entity.relationsByFromEntityId.nodes,
    triples,
  };
}
