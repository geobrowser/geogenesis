import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Entity, Space, SpaceConfigEntity } from '~/core/types';
import { Entity as EntityModule } from '~/core/utils/entity';

import { fetchEntities } from './fetch-entities';
import { graphql } from './graphql';

const getFetchSpaceQuery = (id: string) => `query {
  space(id: "${id}") {
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
}`;

export interface FetchSpaceOptions {
  id: string;
}

type NetworkResult = {
  space: {
    id: string;
    isRootSpace: boolean;
    spaceAdmins: { nodes: { accountId: string }[] };
    spaceEditors: { nodes: { accountId: string }[] };
    spaceEditorControllers: { nodes: { accountId: string }[] };
    createdAtBlock: string;
  } | null;
};

export async function fetchSpace(options: FetchSpaceOptions): Promise<Space | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpaceQuery(options.id),
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
            `Encountered runtime graphql error in fetchSpace. queryId: ${queryId} spaceId: ${
              options.id
            } endpoint: ${endpoint}
            
            queryString: ${getFetchSpaceQuery(options.id)}
            `,
            error.message
          );

          return {
            space: null,
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch space, queryId: ${queryId} spaceId: ${options.id} endpoint: ${endpoint}`
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

  const spaceConfigs = await fetchEntities({
    query: '',
    first: 1,
    spaceId: options.id,
    skip: 0,
    typeIds: [SYSTEM_IDS.SPACE_CONFIGURATION],
    filter: [],
  });

  const spaceConfig = spaceConfigs[0] as Entity | undefined;
  const spaceConfigWithImage: SpaceConfigEntity | null = spaceConfig
    ? {
        ...spaceConfig,
        image: EntityModule.cover(spaceConfig.triples) ?? null,
      }
    : null;

  return {
    id: networkSpace.id,
    isRootSpace: networkSpace.isRootSpace,
    admins: networkSpace.spaceAdmins.nodes.map(account => account.accountId),
    editorControllers: networkSpace.spaceEditorControllers.nodes.map(account => account.accountId),
    editors: networkSpace.spaceEditors.nodes.map(account => account.accountId),
    // @TODO: Map the name and image of a space from the space configuration
    spaceConfig: spaceConfigWithImage,
    createdAtBlock: networkSpace.createdAtBlock,
  };
}
