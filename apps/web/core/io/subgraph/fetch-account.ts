import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';
import { getAddress } from 'viem';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';

export interface FetchAccountOptions {
  address: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  account: {
    id: string;
  } | null;
}

function getAccountQuery(address: string) {
  return `query {
    account(id: "${getAddress(address)}") {
      id
    }
  }`;
}

export async function fetchAccount(
  options: FetchAccountOptions
): Promise<{ address: string; profile: Profile } | null> {
  const queryId = uuid();
  const config = Environment.getConfig();

  const fetchWalletsGraphqlEffect = graphql<NetworkResult>({
    endpoint: config.api,
    query: getAccountQuery(options.address),
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
            `Encountered runtime graphql error in fetchAccount. queryId: ${queryId} endpoint: ${config.api} address: ${
              options.address
            }
            
            queryString: ${getAccountQuery(options.address)}
            `,
            error.message
          );

          return null;
        default:
          console.error(
            `${error._tag}: Unable to fetch wallets to derive profile, queryId: ${queryId} endpoint: ${config.api} address: ${options.address}`
          );

          return null;
      }
    }

    return resultOrError.right;
  });

  const networkResult = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!networkResult?.account) {
    return null;
  }

  const account = networkResult.account;
  const profile = await fetchProfile({ address: account.id });

  return {
    address: account.id,
    profile,
  };
}
