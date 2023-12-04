import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Space } from '~/core/types';

import { fetchTriples } from './fetch-triples';
import { graphql } from './graphql';

const getFetchSpacesQuery = () => `query {
  spaces {
    nodes {
      id
      isRootSpace
      spaceAdmins {
        nodes {
          accountId
        }
      }
      spaceEditors {
        nodes {
          accountId
        }
      }
      spaceEditorControllers {
        nodes {
          accountId
        }
      }
      createdAtBlock
    }
  }
}`;

export interface FetchSpacesOptions {
  endpoint: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  spaces: {
    nodes: {
      id: string;
      isRootSpace: boolean;
      spaceAdmins: { nodes: { accountId: string }[] };
      spaceEditors: { nodes: { accountId: string }[] };
      spaceEditorControllers: { nodes: { accountId: string }[] };
      createdAtBlock: string;
    }[];
  };
}

export async function fetchSpaces(options: FetchSpacesOptions) {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const spaceConfigTriples = await fetchTriples({
    endpoint,
    query: '',
    first: 200,
    skip: 0,
    filter: [
      // Fetch triples where types is Space Configuration
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      { field: 'linked-to', value: SYSTEM_IDS.SPACE_CONFIGURATION },
    ],
  });

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(),
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
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${options.endpoint}
            
            queryString: ${getFetchSpacesQuery()}
            `,
            error.message
          );

          return {
            spaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${options.endpoint}`);

          return {
            spaces: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  // console.log(
  //   'configs',
  //   spaceConfigTriples.map(t => ({
  //     space: t.space,
  //     entityId: t.entityId,
  //   }))
  // );

  const spaces = result.spaces.nodes.map((space): Space => {
    const configEntityId = spaceConfigTriples.find(triple => triple.space === space.id)?.entityId;

    return {
      id: space.id,
      isRootSpace: space.isRootSpace,
      admins: space.spaceAdmins.nodes.map(account => account.accountId),
      editorControllers: space.spaceEditorControllers.nodes.map(account => account.accountId),
      editors: space.spaceEditors.nodes.map(account => account.accountId),
      entityId: configEntityId || '',
      attributes: {},
      spaceConfigEntityId: configEntityId || null,
      createdAtBlock: space.createdAtBlock,
    };
  });

  return spaces;
}
