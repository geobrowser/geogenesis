import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { graphql } from './subgraph/graphql';

const getFetchUserProposalCountQuery = (createdBy: string) => {
  const where = [`createdBy_starts_with_nocase: ${JSON.stringify(createdBy)}`];

  return `query {
    proposals(first: 1000, where: {${where}}, orderBy: createdAt, orderDirection: desc) {
      id
      status
    }
  }`;
};

export interface FetchUserProposalCountOptions {
  endpoint: string;
  userId: string; // For now we use the address
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposals: Array<{ id: string; status: string }>;
}

export async function fetchProposalCountByUser({
  endpoint,
  userId,
  signal,
}: FetchUserProposalCountOptions): Promise<number> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getFetchUserProposalCountQuery(userId),
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
            `Encountered runtime graphql error in fetchProposalCount. queryId: ${queryId} userId: ${userId} endpoint: ${endpoint}

            queryString: ${getFetchUserProposalCountQuery(userId)}
            `,
            error.message
          );
          return {
            proposals: [],
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} userId: ${userId} endpoint: ${endpoint}`
          );
          return {
            proposals: [],
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return result.proposals.length ?? 0;
}
