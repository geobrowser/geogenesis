import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

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

interface NetworkResult {
  membershipRequests: MembershipRequest[];
}

export async function fetchInterimMembershipRequests({
  endpoint,
  spaceId,
  signal,
}: FetchProposalsOptions): Promise<MembershipRequest[]> {
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
  return result.membershipRequests;
}
