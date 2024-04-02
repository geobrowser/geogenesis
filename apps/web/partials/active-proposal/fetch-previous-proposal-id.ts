import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';

const getFetchSpaceProposalsQuery = (spaceId: string, createdAt: number) => `query {
  proposals(first: 1, filter: {spaceId: { equalTo: ${JSON.stringify(
    spaceId
  )} }, createdAt: { lessThan: ${createdAt} } status: { equalTo: ACCEPTED} }) {
    nodes {
      id
    }
  }
}`;

export interface FetchProposalsOptions {
  spaceId: string;
  createdAt: number;
}

interface NetworkResult {
  proposals: { nodes: { id: string }[] };
}

export async function fetchPreviousProposalId({ spaceId, createdAt }: FetchProposalsOptions): Promise<string | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchSpaceProposalsQuery(spaceId, createdAt),
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
            `Encountered runtime graphql error in fetchPreviousProposal. queryId: ${queryId} spaceId: ${spaceId} createdAt: ${createdAt}
            
            queryString: ${getFetchSpaceProposalsQuery(spaceId, createdAt)}
            `,
            error.message
          );
          return {
            proposals: {
              nodes: [],
            },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} spaceId: ${spaceId} createdAt: ${createdAt}`
          );
          return {
            proposals: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposals = result.proposals.nodes;

  if (proposals.length === 0) {
    return null;
  }

  return proposals[0].id;
}
