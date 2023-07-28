import { Effect } from 'effect';

import { Proposal } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposal, fromNetworkActions } from './network-local-mapping';

const getFetchProposalsQuery = (spaceId: string, skip = 0) => `query {
  proposals(first: 10, where: {space: ${JSON.stringify(
    spaceId
  )}}, orderBy: createdAt, orderDirection: desc, skip: ${skip}) {
    id
    name
    description
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    status
    proposedVersions {
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
    }
  }
}`;

export interface FetchProposalsOptions {
  endpoint: string;
  spaceId: string;
  abortController?: AbortController;
  page?: number;
}

interface NetworkResult {
  data: { proposals: NetworkProposal[] };
  errors: unknown[];
}

export async function fetchProposals(options: FetchProposalsOptions): Promise<Proposal[]> {
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchProposalsQuery(options.spaceId, options.page),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch proposals, spaceId: ${options.spaceId} endpoint: ${options.endpoint} page: ${options.page}`
      );
      return Effect.succeed({
        data: {
          proposals: [],
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
      `Encountered runtime graphql error in fetchProposals. spaceId: ${options.spaceId} endpoint: ${
        options.endpoint
      } page: ${options.page}
      
      queryString: ${getFetchProposalsQuery(options.spaceId, options.page)}
      `,
      result.errors
    );
    return [];
  }

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(
    result.data.proposals.map(v => fetchProfile({ address: v.createdBy?.id, endpoint: options.endpoint }))
  );

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return result.data.proposals.map(p => {
    return {
      ...p,
      name: p.name,
      description: p.description,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[p.createdBy.id] ?? p.createdBy,
      proposedVersions: p.proposedVersions.map(v => {
        return {
          ...v,
          createdBy: profiles[v.createdBy.id] ?? v.createdBy,
          actions: fromNetworkActions(v.actions, options.spaceId),
        };
      }),
    };
  });
}
