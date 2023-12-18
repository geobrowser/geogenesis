import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { SubstreamNetworkEntity, fromNetworkTriples } from './network-local-mapping';

function getFetchEntityQuery(id: string, blockNumber?: number) {
  return `query {
    geoEntity(id: ${JSON.stringify(id)}) {
      id,
      name
      triplesByEntityId(filter: {isStale: {equalTo: false}}) {
        nodes {
          id
          attribute {
            id
            name
          }
          entity {
            id
            name
          }
          entityValue {
            id
            name
          }
          numberValue
          stringValue
          valueType
          valueId
          isProtected
          space {
            id
          }
        }
      }
    }
  }`;
}

export interface FetchEntityOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  geoEntity: SubstreamNetworkEntity | null;
}

export async function fetchEntity(options: FetchEntityOptions): Promise<IEntity | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

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
            geoEntity: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch entity, queryId: ${queryId} endpoint: ${endpoint} id: ${options.id}`
          );
          return {
            geoEntity: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const entity = result.geoEntity;

  if (!entity) {
    return null;
  }

  const networkTriples = entity.triplesByEntityId.nodes;
  const triples = fromNetworkTriples(networkTriples);
  const nameTriple = Entity.nameTriple(triples);

  return {
    id: entity.id,
    name: entity.name,
    description: Entity.description(triples),
    nameTripleSpace: nameTriple?.space,
    types: Entity.types(triples, entity?.nameTripleSpace ?? ''),
    triples,
  };
}
