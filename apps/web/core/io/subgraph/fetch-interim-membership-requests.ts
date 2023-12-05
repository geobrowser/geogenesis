import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Profile, Space } from '~/core/types';

import { Subgraph } from '..';
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
  space: {
    id: string;
    name: string;
    image: string | null;
  };
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

  const [maybeMemberProfiles, maybeSpaces] = await Promise.all([
    Promise.all(
      result.membershipRequests.map(request =>
        Subgraph.fetchProfile({
          address: request.requestor,
        })
      )
    ),
    Promise.all(
      result.membershipRequests.map(async request => {
        const space = await Subgraph.fetchSpace({ id: request.space });

        if (!space) {
          return null;
        }

        return [request.id, space];
      })
    ),
  ]);

  const memberProfiles = maybeMemberProfiles.filter((profile): profile is [string, Profile] => !!profile);
  const spaces = maybeSpaces.filter((space): space is [string, Space] => !!space);

  // Write a function to map the requestor address to the profile
  const memberAddressToProfilesMap = memberProfiles.reduce((acc, [, profile]) => {
    acc.set(profile.address, profile);
    return acc;
  }, new Map<string, Profile>());

  const requestIdToSpaceMap = spaces.reduce((acc, [requestId, space]) => {
    acc.set(requestId, space);
    return acc;
  }, new Map<string, Space>());

  return result.membershipRequests.map((request): MembershipRequestWithProfile => {
    const profile = memberAddressToProfilesMap.get(request.requestor);
    const space = requestIdToSpaceMap.get(request.id);

    const spaceMetadata = {
      id: space?.id ?? request.space,
      name: space?.attributes.name ?? request.space,
      image: space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null,
    };

    return {
      ...request,
      space: spaceMetadata,
      requestor: profile ?? {
        id: request.requestor,
        avatarUrl: null,
        coverUrl: null,
        name: null,
        profileLink: null,
        address: request.requestor as `0x${string}`,
      },
    };
  });
}
