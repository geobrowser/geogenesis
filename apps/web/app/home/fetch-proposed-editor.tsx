import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { fetchProfile } from '~/core/io/subgraph';
import { defaultProfile } from '~/core/io/subgraph/fetch-profile-via-wallets-triple';
import { graphql } from '~/core/io/subgraph/graphql';
import { Profile } from '~/core/types';

const getProposedEditorInProposalQuery = (proposalId: string) => `query {
  proposedEditors(
    first: 1
    filter: { proposalId: { equalTo: "${proposalId}" } }
  ) {
    nodes {
      accountId
    }
  }
}`;

interface NetworkResult {
  proposedEditors: {
    nodes: {
      accountId: string;
    }[];
  };
}

export async function fetchProposedEditorForProposal(proposalId: string): Promise<Profile> {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedEditorInProposalQuery(proposalId),
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
            `Encountered runtime graphql error in fetchProposedMember. proposalId: ${proposalId} endpoint: ${endpoint}

            queryString: ${getProposedEditorInProposalQuery(proposalId)}
            `,
            error.message
          );

          return {
            proposedEditors: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch subspace, proposalId: ${proposalId} endpoint: ${endpoint}`);

          return {
            proposedEditors: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedEditors = result.proposedEditors.nodes;

  if (proposedEditors.length === 0) {
    return defaultProfile('');
  }

  // There should only be one proposed editor in a single proposal
  const proposedEditorAccount = proposedEditors[0].accountId;
  return await Effect.runPromise(fetchProfile(proposedEditorAccount));
}
