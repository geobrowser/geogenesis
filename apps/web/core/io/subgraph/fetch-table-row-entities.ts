import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples } from './network-local-mapping';

// this differs from the fetchEntities method in that we pass in a custom graphql string that represents
// the set of custom Table filters set on the table. These filters have small differences from the other
// types of filters we have in the app, so we are using a separate method to fetch them for now.
//
// Ideally we let the caller define the logic for fetching and handling the result, but for now we are
// following the pre-existing pattern.
function getFetchTableRowsQuery(filter: string, first = 100, skip = 0) {
  return `query {
    geoEntities(filter: ${filter} first: ${first} offset: ${skip}) {
      nodes {
        id
        name
        triplesByEntityId(filter: { isStale: { equalTo: false } }) {
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
    }
  }`;
}

export interface FetchTableRowEntitiesOptions {
  first?: number;
  skip?: number;
  typeIds?: string[];
  filter: string; // this is a graphql query string
  signal?: AbortController['signal'];
}

interface NetworkResult {
  geoEntities: { nodes: SubstreamEntity[] };
}

export async function fetchTableRowEntities(options: FetchTableRowEntitiesOptions): Promise<IEntity[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchTableRowsQuery(options.filter, options.first, options.skip),
    signal: options?.signal,
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
            `Encountered runtime graphql error in fetchTableRowEntities. queryId: ${queryId} skip: ${
              options.skip
            } first: ${options.first} filter: ${options.filter}
            
            queryString: ${getFetchTableRowsQuery(options.filter, options.first, options.skip)}
            `,
            error.message
          );

          return {
            geoEntities: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch table row entities, queryId: ${queryId} skip: ${options.skip} first: ${options.first} filter: ${options.filter}`
          );

          return {
            geoEntities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const { geoEntities } = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return geoEntities.nodes.map(result => {
    const networkTriples = result.triplesByEntityId.nodes;

    // If there is no latest version just return an empty entity.
    if (networkTriples.length === 0) {
      return {
        id: result.id,
        name: result.name,
        description: null,
        types: [],
        triples: [],
      };
    }

    const triples = fromNetworkTriples(networkTriples);
    const nameTriples = Entity.nameTriples(triples);

    return {
      id: result.id,
      name: result.name,
      description: Entity.description(triples),
      nameTripleSpaces: nameTriples.map(t => t.space),
      types: Entity.types(triples),
      triples,
    };
  });
}
