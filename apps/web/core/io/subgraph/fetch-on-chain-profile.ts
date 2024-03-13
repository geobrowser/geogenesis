import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { OnchainProfile } from '~/core/types';

import { graphql } from './graphql';

export interface FetchOnchainProfileOptions {
  address: string;
  signal?: AbortController['signal'];
}

interface OnchainGeoProfile {
  id: string;
  homeSpaceId: string;
  accountId: string;
}

interface NetworkResult {
  onchainProfiles: { nodes: OnchainGeoProfile[] };
}

// We fetch for geoEntities -> name because the id of the wallet entity might not be the
// same as the actual wallet address.
function getFetchProfileQuery(address: string) {
  // Have to fetch the profiles as an array as we can't query an individual profile by it's account.
  // account_starts_with_nocase is also a hack since our subgraph does not store the account the same
  // way as the profiles. Profiles are a string but `createdBy` in our subgraph is stored as Bytes.
  return `query {
    onchainProfiles(filter: { accountId: { equalTo: "${address}" } } first: 1) {
      nodes {
        id
        accountId
        homeSpaceId
      }
    }
  }`;
}

export async function fetchOnchainProfile(options: FetchOnchainProfileOptions): Promise<OnchainProfile | null> {
  const queryId = uuid();
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const fetchWalletsGraphqlEffect = graphql<NetworkResult>({
    endpoint: config.api,
    query: getFetchProfileQuery(options.address),
    signal: options?.signal,
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(fetchWalletsGraphqlEffect));

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
            `Encountered runtime graphql error in fetchProfile. queryId: ${queryId} endpoint: ${
              config.profileSubgraph
            } address: ${options.address}
            
            queryString: ${getFetchProfileQuery(options.address)}
            `,
            error.message
          );

          return {
            onchainProfiles: {
              nodes: [],
            },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch wallets to derive profile, queryId: ${queryId} endpoint: ${config.profileSubgraph} address: ${options.address}`
          );

          return {
            onchainProfiles: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (result.onchainProfiles.nodes.length === 0) {
    return null;
  }

  return result.onchainProfiles.nodes[0];
}
