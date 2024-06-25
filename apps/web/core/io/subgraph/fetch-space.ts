import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { GovernanceType, Space, SpaceConfigEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { spaceFragment, spaceMetadataFragment, spacePluginsFragment, tripleFragment } from './fragments';
import { graphql } from './graphql';
import { SubstreamEntity, fromNetworkTriples, getSpaceConfigFromMetadata } from './network-local-mapping';
import { NetworkSpaceResult } from './types';

const getFetchSpaceQuery = (id: string) => `query {
  space(id: "${id}") {
    ${spaceFragment}
  }
}`;

export interface FetchSpaceOptions {
  id: string;
}

type NetworkResult = {
  space: NetworkSpaceResult | null;
};

export async function fetchSpace(options: FetchSpaceOptions): Promise<Space | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

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
  const spaceConfigWithImage = getSpaceConfigFromMetadata(networkSpace.id, networkSpace.metadata.nodes[0]);

  return {
    id: networkSpace.id,
    type: networkSpace.type,
    isRootSpace: networkSpace.isRootSpace,
    editors: networkSpace.spaceEditors.nodes.map(account => account.accountId),
    members: networkSpace.spaceMembers.nodes.map(account => account.accountId),
    spaceConfig: spaceConfigWithImage,
    createdAtBlock: networkSpace.createdAtBlock,

    mainVotingPluginAddress: networkSpace.mainVotingPluginAddress,
    memberAccessPluginAddress: networkSpace.memberAccessPluginAddress,
    personalSpaceAdminPluginAddress: networkSpace.personalSpaceAdminPluginAddress,
    spacePluginAddress: networkSpace.spacePluginAddress,
  };
}
