import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { NetworkEntity, fromNetworkTriples } from './network-local-mapping';

export type FetchEntityOptions = {
  endpoint: string;
  id: string;
  blockNumber?: number;
  abortController?: AbortController;
};

type NetworkResult = {
  data: {
    geoEntity: NetworkEntity | null;
  };
  errors: unknown[];
};

export const getFetchEntityQuery = (id: string, blockNumber?: number) => {
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
};

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
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch entity, queryId: ${queryId} endpoint: ${options.endpoint} id: ${options.id} blockNumber: ${options.blockNumber}`
      );
      return Effect.succeed({
        data: {
          geoEntity: null,
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchEntity. queryId: ${queryId} endpoint: ${options.endpoint} id: ${
        options.id
      } blockNumber: ${options.blockNumber}
      
      queryString: ${getFetchEntityQuery(options.id, options.blockNumber)}
      `,
      result.errors
    );
    return null;
  }

  const entity = result.data.geoEntity;

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
