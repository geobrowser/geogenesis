import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect } from 'effect';
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
  data: { spaces: NetworkSpace[] };
  errors: unknown[];
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

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(`Unable to fetch spaces, queryId: ${queryId} endpoint: ${options.endpoint}`);
      return Effect.succeed({
        data: {
          spaces: [],
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  // @TODO: Fallback
  // @TODO: runtime validation of types
  // @TODO: log fail states
  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${options.endpoint}
      
      queryString: ${getFetchSpacesQuery()}
      `,
      result.errors
    );
    return [];
  }

  const spaces = result.data.spaces.map((space): Space => {
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
