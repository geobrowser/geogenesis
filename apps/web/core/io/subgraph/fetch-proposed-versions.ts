import { Effect } from 'effect';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposedVersion, fromNetworkActions } from './network-local-mapping';

const getProposedVersionsQuery = (entityId: string, skip) => `query {
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
  abortController?: AbortController;
}

interface NetworkResult {
  data: { proposedVersions: NetworkProposedVersion[] };
  errors: unknown[];
}

export async function fetchProposedVersions({
  endpoint,
  entityId,
  spaceId,
  abortController,
  page = 0,
}: FetchProposedVersionsOptions) {
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getProposedVersionsQuery(entityId, page * 10),
    abortController: abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch proposedVersions, entityId: ${entityId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}`
      );
      return Effect.succeed({
        data: {
          proposedVersions: [],
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  // @TODO: Fallback
  // @TODO: runtime validation of types
  // @TODO: log fail states
  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchProposals. spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}
      
      queryString: ${getProposedVersionsQuery(entityId, page * 10)}
      `,
      result.errors
    );
    return [];
  }

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(
    result.data.proposedVersions.map(v => fetchProfile({ address: v.createdBy.id, endpoint }))
  );

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return result.data.proposedVersions.map(v => {
    return {
      ...v,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[v.createdBy.id] ?? v.createdBy,
      actions: fromNetworkActions(v.actions, spaceId),
    };
  });
}
