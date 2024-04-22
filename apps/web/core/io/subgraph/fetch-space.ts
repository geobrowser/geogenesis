import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Space, SpaceConfigEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples } from './network-local-mapping';

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

    metadata {
      nodes {
        id
        name
        triplesByEntityId {
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
    metadata: { nodes: SubstreamEntity[] };
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

  const spaceConfig = networkSpace.metadata.nodes[0] as SubstreamEntity | undefined;
  const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triplesByEntityId.nodes ?? []);

  const spaceConfigWithImage: SpaceConfigEntity | null = spaceConfig
    ? {
        id: spaceConfig.id,
        name: spaceConfig.name,
        description: null,
        image: Entity.avatar(spaceConfigTriples) ?? Entity.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
        triples: spaceConfigTriples,
        types: Entity.types(spaceConfigTriples),
        nameTripleSpaces: Entity.nameTriples(spaceConfigTriples).map(t => t.space),
      }
    : null;

  return {
    id: networkSpace.id,
    isRootSpace: networkSpace.isRootSpace,
    admins: networkSpace.spaceAdmins.nodes.map(account => account.accountId),
    editorControllers: networkSpace.spaceEditorControllers.nodes.map(account => account.accountId),
    editors: networkSpace.spaceEditors.nodes.map(account => account.accountId),
    spaceConfig: spaceConfigWithImage,
    createdAtBlock: networkSpace.createdAtBlock,
  };
}
