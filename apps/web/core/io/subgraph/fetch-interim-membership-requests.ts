import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { options } from '~/core/environment/environment';
import { Profile } from '~/core/types';

import { Subgraph } from '..';
import { fetchProfilePermissionless } from './fetch-profile-permissionless';
import { graphql } from './graphql';

const getFetchMembershipRequestsQuery = (spaceId: string) => `query {
  membershipRequests(where: {space: "${spaceId}"} orderBy: createdAt orderDirection: desc) {
    id
    requestor
    space
    createdAt
  }
}`;

export interface FetchProposalsOptions {
  endpoint: string;
  spaceId: string;
  signal?: AbortController['signal'];
}

export type MembershipRequest = {
  id: string;
  requestor: string;
  space: string;
  createdAt: string;
};

export interface MembershipRequestWithProfile {
  id: string;
  space: string;
  createdAt: string;
  requestor: Profile;
}

interface NetworkResult {
  membershipRequests: MembershipRequest[];
}

export async function fetchInterimMembershipRequests({
  endpoint,
  spaceId,
  signal,
}: FetchProposalsOptions): Promise<MembershipRequestWithProfile[]> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getFetchMembershipRequestsQuery(spaceId),
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
            `Encountered runtime graphql error in fetchInterimMembershipRequests. queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint}

            queryString: ${getFetchMembershipRequestsQuery(spaceId)}
            `,
            error.message
          );
          return {
            membershipRequests: [],
          };
        default:
          console.error(
            `${error._tag}: Unable to fetchInterimMembershipRequests, queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint}`
          );
          return {
            membershipRequests: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const memberProfiles = (
    await Promise.all(
      result.membershipRequests.map(async request => {
        console.log('request.requestor', request.requestor);
        const maybeProfile = await fetchProfilePermissionless({ address: request.requestor, endpoint });

        if (!maybeProfile) {
          return Subgraph.fetchProfile({ endpoint: options.production.subgraph, address: request.requestor });
        }

        return maybeProfile;
      })
    )
  ).flatMap(profile => (profile ? [profile] : []));

  let membershipAddressToProfilesMap = new Map<string, Profile>();

  console.log('memberProfiles', memberProfiles);

  // Write a function to map the requestor address to the profile
  // const memberAddressToProfilesMap = Object.fromEntries(memberProfiles.flatMap(p => (p ? [p] : [])));

  return result.membershipRequests.map(
    (request): MembershipRequestWithProfile => ({
      ...request,
      requestor: membershipAddressToProfilesMap.get(request.requestor) ?? {
        id: request.requestor,
        avatarUrl: '',
        coverUrl: '',
        name: '',
      },
    })
  );
}
