import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Space, SpaceConfigEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples } from './network-local-mapping';

const getFetchSpacesQuery = (ids: string[]) => `query {
  spaces(filter: {id: {in: ${JSON.stringify(ids)}}}) {
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
      
      metadata {
        nodes {
          id
          name
          triplesByEntityId(filter: {isStale: {equalTo: false}}) {
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
      metadata: { nodes: SubstreamEntity[] };
    }[];
  };
}

export async function fetchSpacesById(ids: string[]) {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(ids),
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

            queryString: ${getFetchSpacesQuery(ids)}
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

  const spaces = result.spaces.nodes.map((space): Space => {
    const spaceConfig = space.metadata.nodes[0] as SubstreamEntity | undefined;
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
