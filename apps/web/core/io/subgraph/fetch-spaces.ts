import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Space, SpaceConfigEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { entityFragment, spaceMetadataFragment, spacePluginsFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples, getSpaceConfigFromMetadata } from './network-local-mapping';

const getFetchSpacesQuery = () => `query {
  spaces {
    nodes {
      id
      isRootSpace
      ${spacePluginsFragment}
  
      spaceEditors {
        nodes {
          accountId
        }
      }
  
      spaceMembers {
        nodes {
          accountId
        }
      }
  
      createdAtBlock
  
      metadata {
        nodes {
          ${entityFragment}
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
      mainVotingPluginAddress: string | null;
      memberAccessPluginAddress: string;
      spacePluginAddress: string;
      spaceEditors: { nodes: { accountId: string }[] };
      spaceMembers: { nodes: { accountId: string }[] };
      createdAtBlock: string;
      metadata: { nodes: SubstreamEntity[] };
    }[];
  };
}

export async function fetchSpaces() {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

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

  const spaces = result.spaces.nodes.map((space): Space => {
    const spaceConfigWithImage = getSpaceConfigFromMetadata(space.id, space.metadata.nodes[0]);

    return {
      id: space.id,
      isRootSpace: space.isRootSpace,
      editors: space.spaceEditors.nodes.map(account => account.accountId),
      members: space.spaceMembers.nodes.map(account => account.accountId),
      spaceConfig: spaceConfigWithImage,
      createdAtBlock: space.createdAtBlock,

      mainVotingPluginAddress: space.mainVotingPluginAddress,
      memberAccessPluginAddress: space.memberAccessPluginAddress,
      spacePluginAddress: space.spacePluginAddress,
    };
  });

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceConfig ? [s] : []));
}
