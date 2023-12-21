import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Entity, Space, SpaceConfigEntity } from '~/core/types';
import { Entity as EntityModule } from '~/core/utils/entity';

import { fetchEntities } from './fetch-entities';
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

export async function fetchSpaces() {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(),
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
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${endpoint}
            
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
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${endpoint}`);

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

  const spaceConfigs = await Promise.all(
    result.spaces.nodes.map(async s => {
      const configs = await fetchEntities({
        query: '',
        first: 1,
        spaceId: s.id,
        skip: 0,
        typeIds: [SYSTEM_IDS.SPACE_CONFIGURATION],
        filter: [],
      });

      const spaceConfig: Entity | undefined = configs[0];

      return {
        spaceId: s.id,
        config: spaceConfig,
      };
    })
  );

  const spaces = result.spaces.nodes.map((space): Space => {
    const config = spaceConfigs.find(config => config.spaceId === space.id)?.config;

    const spaceConfigWithImage: SpaceConfigEntity | null = config
      ? {
          ...config,
          image: EntityModule.cover(config.triples) ?? EntityModule.avatar(config.triples) ?? null,
        }
      : null;

    return {
      id: space.id,
      isRootSpace: space.isRootSpace,
      admins: space.spaceAdmins.nodes.map(account => account.accountId),
      editorControllers: space.spaceEditorControllers.nodes.map(account => account.accountId),
      editors: space.spaceEditors.nodes.map(account => account.accountId),
      spaceConfig: spaceConfigWithImage,
      createdAtBlock: space.createdAtBlock,
    };
  });

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceConfig ? [s] : []));
}
