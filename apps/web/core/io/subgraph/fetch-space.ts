import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { ROOT_SPACE_IMAGE } from '~/core/constants';
import { Space } from '~/core/types';

import { fetchTriples } from './fetch-triples';
import { graphql } from './graphql';
import { NetworkSpace } from './network-local-mapping';

const getFetchSpaceQuery = (id: string) => `query {
  space(id: "${id}") {
    id
    isRootSpace
    admins {
      id
    }
    editors {
      id
    }
    editorControllers {
      id
    }
    entity {
      id
      entityOf {
        id
        stringValue
        attribute {
          id
        }
      }
    }
    createdAtBlock
  }
}`;

export interface FetchSpaceOptions {
  endpoint: string;
  id: string;
  signal?: AbortController['signal'];
}

type NetworkResult = {
  space: NetworkSpace | null;
};

export async function fetchSpace(options: FetchSpaceOptions): Promise<Space | null> {
  const queryId = uuid();

  const spaceConfigTriples = await fetchTriples({
    endpoint: options.endpoint,
    query: '',
    first: 1000,
    skip: 0,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      { field: 'linked-to', value: SYSTEM_IDS.SPACE_CONFIGURATION },
    ],
  });

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchSpaceQuery(options.id),
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
            `Encountered runtime graphql error in fetchSpace. queryId: ${queryId} spaceId: ${options.id} endpoint: ${
              options.endpoint
            }
            
            queryString: ${getFetchSpaceQuery(options.id)}
            `,
            error.message
          );

          return {
            space: null,
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch space, queryId: ${queryId} spaceId: ${options.id} endpoint: ${options.endpoint}`
          );

          return {
            space: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!result.space) {
    return null;
  }

  const networkSpace = result.space;

  const attributes = Object.fromEntries(
    networkSpace.entity?.entityOf.map(entityOf => [entityOf.attribute.id, entityOf.stringValue]) || []
  );

  if (networkSpace.isRootSpace) {
    attributes.name = 'Root';
    attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] = ROOT_SPACE_IMAGE;
  }

  return {
    id: networkSpace.id,
    isRootSpace: networkSpace.isRootSpace,
    admins: networkSpace.admins.map(account => account.id),
    editorControllers: networkSpace.editorControllers.map(account => account.id),
    editors: networkSpace.editors.map(account => account.id),
    entityId: networkSpace.entity?.id || '',
    attributes,
    spaceConfigEntityId: spaceConfigTriples.find(triple => triple.space === networkSpace.id)?.entityId || null,
    createdAtBlock: networkSpace.createdAtBlock,
  };
}
