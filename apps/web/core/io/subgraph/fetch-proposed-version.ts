import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposedVersion, fromNetworkActions } from './network-local-mapping';

export const getProposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
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

export interface FetchProposedVersionOptions {
  endpoint: string;
  id: string;
  abortController?: AbortController;
}

interface NetworkResult {
  data: { proposedVersions: NetworkProposedVersion[] };
  errors: unknown[];
}

export async function fetchProposedVersion({ endpoint, id, abortController }: FetchProposedVersionOptions) {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getProposedVersionQuery(id),
    abortController: abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(`Unable to fetch proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}`);
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
      `Encountered runtime graphql error in proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}
      
      queryString: ${getProposedVersionQuery(id)}
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
