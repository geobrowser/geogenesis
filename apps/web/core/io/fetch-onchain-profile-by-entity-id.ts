import { Effect, Either } from 'effect';

import { Environment } from '../environment';
import { graphql } from './subgraph/graphql';

function getFetchProfileQuery(entityId: string) {
  // Have to fetch the profiles as an array as we can't query an individual profile by it's account.
  // account_starts_with_nocase is also a hack since our subgraph does not store the account the same
  // way as the profiles. Profiles are a string but `createdBy` in our subgraph is stored as Bytes.
  return `query {
    onchainProfiles(id: "${entityId}") {
      id
      homeSpaceId
      accountId
    }
  }`;
}

interface OnchainGeoProfile {
  id: string;
  homeSpaceId: string;
  accountId: string;
}

interface NetworkResult {
  geoProfile: OnchainGeoProfile | null;
}

export async function fetchOnchainProfileByEntityId(entityId: string): Promise<OnchainGeoProfile | null> {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const fetchWalletsGraphqlEffect = graphql<NetworkResult>({
    endpoint: config.api,
    query: getFetchProfileQuery(entityId),
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
            `Encountered runtime graphql error in fetchProfile. endpoint: ${
              config.profileSubgraph
            } entityId: ${entityId}

              queryString: ${getFetchProfileQuery(entityId)}
              `,
            error.message
          );

          return {
            geoProfile: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch wallets to derive profile, endpoint: ${config.profileSubgraph} entityId: ${entityId}`
          );

          return {
            geoProfile: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return result.geoProfile;
}
