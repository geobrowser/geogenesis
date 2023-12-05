import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposedVersion, fromNetworkActions } from './network-local-mapping';

const getProposedVersionsQuery = (entityId: string, skip: number) => `query {
  proposedVersions(where: {entity: ${JSON.stringify(
    entityId
  )}}, orderBy: createdAt, orderDirection: desc, first: 10, skip: ${skip}) {
    id
    name
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    actions {
      actionType
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
    }
    entity {
      id
      name
    }
  }
}`;

export interface FetchProposedVersionsOptions {
  endpoint: string;
  entityId: string;
  spaceId: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposedVersions: NetworkProposedVersion[];
}

export async function fetchProposedVersions({
  endpoint,
  entityId,
  spaceId,
  signal,
  page = 0,
}: FetchProposedVersionsOptions) {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getProposedVersionsQuery(entityId, page * 10),
    signal,
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
            `Encountered runtime graphql error in fetchProposals. queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getProposedVersionsQuery(entityId, page * 10)}
            `,
            error.message
          );

          return {
            proposedVersions: [],
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposedVersions. queryId: ${queryId} entityId: ${entityId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            proposedVersions: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(result.proposedVersions.map(v => fetchProfile({ address: v.createdBy.id })));

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return result.proposedVersions.map(v => {
    return {
      ...v,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[v.createdBy.id] ?? v.createdBy,
      actions: fromNetworkActions(v.actions, spaceId),
    };
  });
}
