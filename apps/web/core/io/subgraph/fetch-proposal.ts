import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { Proposal, ProposalDto } from '../dto/proposals';
import { SubstreamProposal } from '../schema';
import { fetchProfile } from './fetch-profile';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

export const getFetchProposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    type
    onchainProposalId

    edit {
      id
      name
      createdAt
      createdAtBlock
    }

    startTime
    endTime
    status

    proposalVotes {
      totalCount
      nodes {
        vote
        account {
          id
        }
      }
    }

    space {
      id
      spacesMetadata {
        nodes {
          version {
            ${spaceMetadataFragment}
          }
        }
      }
    }

    createdById
    startTime
    endTime
    status

    proposalVotes {
      totalCount
      nodes {
        vote
        account {
          id
        }
      }
    }
  }
}`;

export interface FetchProposalOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposal: SubstreamProposal | null;
}

export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchProposalQuery(options.id),
    signal: options?.signal,
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
            `Encountered runtime graphql error in fetchProposal. queryId: ${queryId} id: ${options.id}

            queryString: ${getFetchProposalQuery(options.id)}
            `,
            error.message
          );

          return {
            proposal: null,
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposal, queryId: ${queryId} id: ${options.id}`);
          return {
            proposal: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const proposal = result.proposal;

  if (!proposal) {
    return null;
  }

  const [profile, voterProfiles] = await Promise.all([
    fetchProfile({ address: proposal.createdById }),
    fetchProfilesByAddresses(proposal.proposalVotes.nodes.map(v => v.account.id)),
  ]);

  const proposalOrError = Schema.decodeEither(SubstreamProposal)(proposal);

  const decodedProposal = Either.match(proposalOrError, {
    onLeft: error => {
      console.error(`Unable to decode proposal ${proposal.id} with error ${error}`);
      return null;
    },
    onRight: proposal => {
      return proposal;
    },
  });

  if (decodedProposal === null) {
    return null;
  }

  return ProposalDto(proposal, profile, voterProfiles);
}
