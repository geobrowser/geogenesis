import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { ProposalWithoutVoters, ProposalWithoutVotersDto } from '../dto/proposals';
import { SubstreamProposal } from '../schema';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { getSpaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpaceProposalsQuery = (spaceId: string, first: number, skip: number) => `query {
  proposals(first: ${first}, filter: { status: { equalTo: ACCEPTED }, spaceId: {equalTo: ${JSON.stringify(
    spaceId
  )}}}, orderBy: END_TIME_DESC, offset: ${skip}) {
    nodes {
      id
      type
      onchainProposalId

      space {
        id
        ${getSpaceMetadataFragment(spaceId)}
      }

      edit {
        id
        name
        createdAt
        createdAtBlock
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
  }
}`;

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
}

interface NetworkResult {
  proposals: { nodes: SubstreamProposal[] };
}

export async function fetchCompletedProposals({
  spaceId,
  signal,
  page = 0,
  first = 5,
}: FetchProposalsOptions): Promise<ProposalWithoutVoters[]> {
  const queryId = uuid();
  const offset = page * first;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: getFetchSpaceProposalsQuery(spaceId, first, offset),
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
            `Encountered runtime graphql error in fetchProposals. queryId: ${queryId} spaceId: ${spaceId} page: ${page}

            queryString: ${getFetchSpaceProposalsQuery(spaceId, first, offset)}
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
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} spaceId: ${spaceId} page: ${page}`
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
  const profilesForProposals = await fetchProfilesByAddresses(proposals.map(p => p.createdById));

  return proposals
    .map(p => {
      const proposalOrError = Schema.decodeEither(SubstreamProposal)(p);

      return Either.match(proposalOrError, {
        onLeft: error => {
          console.error(`Unable to decode proposal ${p.id} with error ${error}`);
          return null;
        },
        onRight: proposal => {
          const maybeProfile = profilesForProposals.find(profile => profile.address === p.createdById);
          return ProposalWithoutVotersDto(proposal, maybeProfile);
        },
      });
    })
    .filter(p => p !== null);
}
