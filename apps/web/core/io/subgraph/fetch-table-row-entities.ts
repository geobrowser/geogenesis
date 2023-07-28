import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { NetworkEntity, fromNetworkTriples } from './network-local-mapping';

// this differs from the fetchEntities method in that we pass in a custom graphql string that represents
// the set of custom Table filters set on the table. These filters have small differences from the other
// types of filters we have in the app, so we are using a separate method to fetch them for now.
//
// Ideally we let the caller define the logic for fetching and handling the result, but for now we are
// following the pre-existing pattern.
function getFetchTableRowsQuery(filter: string, first = 100, skip = 0) {
  return `query {
    geoEntities(where: ${filter}, first: ${first}, skip: ${skip}) {
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

export interface FetchTableRowEntitiesOptions {
  endpoint: string;
  query?: string;
  typeIds?: string[];
  first?: number;
  skip?: number;
  filter: string; // this is a graphql query string
  abortController?: AbortController;
}

interface NetworkResult {
  data: {
    geoEntities: NetworkEntity[];
  };
  errors: unknown[];
}

export async function fetchTableRowEntities(options: FetchTableRowEntitiesOptions): Promise<IEntity[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchTableRowsQuery(options.filter, options.first, options.skip),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch table row entities, queryId: ${queryId} endpoint: ${options.endpoint} query: ${options.query} typeIds: ${options.typeIds} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
      );
      return Effect.succeed({
        data: {
          geoEntities: [],
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchTableRowEntities. queryId: ${queryId} endpoint: ${
        options.endpoint
      } query: ${options.query} typeIds: ${options.typeIds} skip: ${options.skip} first: ${options.first} filter: ${
        options.filter
      }
      
      queryString: ${getFetchTableRowsQuery(options.filter, options.first, options.skip)}
      `,
      result.errors
    );
    return [];
  }

  return result.data.geoEntities.map(result => {
    const triples = fromNetworkTriples(result.entityOf);
    const nameTriple = Entity.nameTriple(triples);

    return {
      id: result.id,
      name: result.name,
      description: Entity.description(triples),
      nameTripleSpace: nameTriple?.space,
      types: Entity.types(triples, nameTriple?.space),
      triples,
    };
  });
}
