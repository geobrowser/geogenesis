import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { ROOT_SPACE_IMAGE } from '~/core/constants';
import { Space } from '~/core/types';

import { fetchTriples } from './fetch-triples';
import { graphql } from './graphql';
import { NetworkSpace } from './network-local-mapping';

const getFetchSpacesQuery = () => `query {
  spaces {
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

export interface FetchSpacesOptions {
  endpoint: string;
  abortController?: AbortController;
}

interface NetworkResult {
  spaces: NetworkSpace[];
}

export async function fetchSpaces(options: FetchSpacesOptions) {
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
    query: getFetchSpacesQuery(),
    abortController: options.abortController,
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
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${options.endpoint}
            
            queryString: ${getFetchSpacesQuery()}
            `,
            error.message
          );

          return {
            spaces: [],
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${options.endpoint}`);

          return {
            spaces: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaces.map((space): Space => {
    const attributes = Object.fromEntries(
      space.entity?.entityOf.map(entityOf => [entityOf.attribute.id, entityOf.stringValue]) || []
    );

    if (space.isRootSpace) {
      attributes.name = 'Root';
      attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] = ROOT_SPACE_IMAGE;
    }

    return {
      id: space.id,
      isRootSpace: space.isRootSpace,
      admins: space.admins.map(account => account.id),
      editorControllers: space.editorControllers.map(account => account.id),
      editors: space.editors.map(account => account.id),
      entityId: space.entity?.id || '',
      attributes,
      spaceConfigEntityId: spaceConfigTriples.find(triple => triple.space === space.id)?.entityId || null,
      createdAtBlock: space.createdAtBlock,
    };
  });

  return spaces;
}
