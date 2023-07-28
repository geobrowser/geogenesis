import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { NetworkEntity, fromNetworkTriples } from './network-local-mapping';

function getFetchEntityQuery(id: string, blockNumber?: number) {
  const blockNumberQuery = blockNumber ? `, block: {number: ${JSON.stringify(blockNumber)}}` : ``;

  return `query {
    geoEntity(id: ${JSON.stringify(id)}${blockNumberQuery}) {
      id,
      name
      entityOf {
        id
        stringValue
        valueId
        valueType
        numberValue
        space {
          id
        }
        entityValue {
          id
          name
        }
        attribute {
          id
          name
        }
        entity {
          id
          name
        }
      }
    }
  }`;
}

export interface FetchEntityOptions {
  endpoint: string;
  id: string;
  blockNumber?: number;
  abortController?: AbortController;
}

interface NetworkResult {
  geoEntity: NetworkEntity | null;
}

export async function fetchEntity(options: FetchEntityOptions): Promise<IEntity | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchEntityQuery(options.id, options.blockNumber),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchTag('GraphqlRuntimeError', error => {
      console.error(
        `Encountered runtime graphql error in fetchEntity. queryId: ${queryId} endpoint: ${options.endpoint} id: ${
          options.id
        } blockNumber: ${options.blockNumber}
        
        queryString: ${getFetchEntityQuery(options.id, options.blockNumber)}
        `,
        error.message
      );

      return Effect.succeed({
        geoEntity: null,
      });
    }),
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch entity, queryId: ${queryId} endpoint: ${options.endpoint} id: ${options.id} blockNumber: ${options.blockNumber}`
      );
      return Effect.succeed({
        geoEntity: null,
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  const entity = result.geoEntity;

  if (!entity) {
    return null;
  }

  const triples = fromNetworkTriples(entity.entityOf);
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
