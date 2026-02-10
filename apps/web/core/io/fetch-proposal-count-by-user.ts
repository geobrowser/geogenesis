import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '../environment';
import { graphql } from './subgraph/graphql';

const getFetchUserProposalCountQuery = (spaceId: string) => {
  return `query {
    proposalsConnection(filter: { proposedBy: { is: "${spaceId}" } }) {
      totalCount
    }
  }`;
};

export type FetchUserProposalCountOptions = {
  spaceId: string;
  signal?: AbortController['signal'];
};

type NetworkResult = {
  proposalsConnection: {
    totalCount: number;
  };
};

export async function fetchProposalCountByUser({ spaceId, signal }: FetchUserProposalCountOptions): Promise<number> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchUserProposalCountQuery(spaceId),
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
            `Encountered runtime graphql error in fetchProposalCount. queryId: ${queryId} spaceId: ${spaceId}

            queryString: ${getFetchUserProposalCountQuery(spaceId)}
            `,
            error.message
          );
          return {
            proposalsConnection: {
              totalCount: 0,
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals, queryId: ${queryId} spaceId: ${spaceId}`);
          return {
            proposalsConnection: {
              totalCount: 0,
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return result.proposalsConnection.totalCount ?? 0;
}
