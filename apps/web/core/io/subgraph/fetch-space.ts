import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect } from 'effect';
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
  abortController?: AbortController;
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
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchTag('GraphqlRuntimeError', error => {
      console.error(
        `Encountered runtime graphql error in fetchSpace. queryId: ${queryId} spaceId: ${options.id} endpoint: ${
          options.endpoint
        }
        
        queryString: ${getFetchSpaceQuery(options.id)}
        `,
        error.message
      );
      return Effect.succeed({
        space: null,
      });
    }),
    Effect.catchAll(() => {
      console.error(`Unable to fetch space, queryId: ${queryId} spaceId: ${options.id} endpoint: ${options.endpoint}`);
      return Effect.succeed({
        space: null,
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

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
