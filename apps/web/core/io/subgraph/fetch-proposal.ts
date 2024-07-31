import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Proposal, SpaceWithMetadata } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { SubstreamEntity, SubstreamProposal, fromNetworkTriples } from '../schema';
import { fetchProfile } from './fetch-profile';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { spaceMetadataFragment, tripleFragment } from './fragments';
import { graphql } from './graphql';

export const getFetchProposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    type
    onchainProposalId
    name

    space {
      id
      spacesMetadata {
        nodes {
          entity {
            ${spaceMetadataFragment}
          }
        }
      }
    }

    createdAtBlock
    createdById
    createdAt
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

    createdBy {
      id
    }

    proposedVersions {
      nodes {
        id
        createdById
        entity {
          id
          name
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
    fetchProfile({ address: proposal.createdBy.id }),
    fetchProfilesByAddresses(proposal.proposalVotes.nodes.map(v => v.account.id)),
  ]);

  const spaceConfig = proposal.space.spacesMetadata.nodes[0].entity as SubstreamEntity | undefined;
  const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triples.nodes ?? []);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: proposal.space.id,
    name: spaceConfig?.name ?? null,
    image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    ...proposal,
    space: spaceWithMetadata,
    createdBy: profile,
    proposalVotes: {
      totalCount: proposal.proposalVotes.totalCount,
      nodes: proposal.proposalVotes.nodes.map(v => {
        const maybeProfile = voterProfiles.find(voter => v.account.id === voter.address);

        const voter = maybeProfile
          ? maybeProfile
          : {
              id: v.account.id,
              address: v.account.id as `0x${string}`,
              name: null,
              avatarUrl: null,
              coverUrl: null,
              profileLink: null,
            };

        return {
          ...v,
          vote: v.vote,
          voter,
        };
      }),
    },
    proposedVersions: proposal.proposedVersions.nodes.map(v => {
      return {
        ...v,
        createdBy: profile,
        space: spaceWithMetadata,
        // actions: fromNetworkOps(v.actions.nodes),
      };
    }),
  };
}
