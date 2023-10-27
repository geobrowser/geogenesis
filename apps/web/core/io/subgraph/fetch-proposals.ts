import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Proposal } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposal, fromNetworkActions } from './network-local-mapping';

const getFetchSpaceProposalsQuery = (spaceId: string, first: number, skip: number) => `query {
  proposals(first: ${first}, where: {space: ${JSON.stringify(
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
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
}

interface NetworkResult {
  proposals: NetworkProposal[];
}

export async function fetchProposals({
  endpoint,
  spaceId,
  signal,
  page = 0,
  first = 10,
}: FetchProposalsOptions): Promise<Proposal[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getFetchSpaceProposalsQuery(spaceId, first, page * 10),
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
            
            queryString: ${getFetchSpaceProposalsQuery(spaceId, first, page * 10)}
            `,
            error.message
          );
          return {
            proposals: [],
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}`
          );
          return {
            proposals: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(
    result.proposals.map(v => fetchProfile({ address: v.createdBy?.id, endpoint: endpoint }))
  );

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return result.proposals.map(p => {
    return {
      ...p,
      name: p.name,
      description: p.description,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[p.createdBy.id] ?? {
        ...p.createdBy,
        address: p.createdBy.id as `0x${string}`,
        profileLink: null,
      },
      proposedVersions: p.proposedVersions.map(v => {
        return {
          ...v,
          createdBy: profiles[v.createdBy.id] ?? {
            ...p.createdBy,
            address: p.createdBy.id as `0x${string}`,
            profileLink: null,
          },
          actions: fromNetworkActions(v.actions, spaceId),
        };
      }),
    };
  });
}
