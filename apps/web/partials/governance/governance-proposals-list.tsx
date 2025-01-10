import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { cookies } from 'next/headers';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { ProposalStatus, ProposalType, SubstreamProposal, SubstreamVote } from '~/core/io/schema';
import { fetchProfile } from '~/core/io/subgraph';
import { fetchProfilesByAddresses } from '~/core/io/subgraph/fetch-profiles-by-ids';
import { graphql } from '~/core/io/subgraph/graphql';
import { Profile } from '~/core/types';
import { getProposalName } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';

interface Props {
  spaceId: string;
  page: number;
}

export async function GovernanceProposalsList({ spaceId, page }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const [proposals, profile] = await Promise.all([
    fetchProposals({ spaceId, first: 5, page, connectedAddress }),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
  ]);

  const userVotesByProposalId = proposals.reduce((acc, p) => {
    if (p.userVotes.length === 0) return acc;

    return acc.set(p.id, p.userVotes[0].vote);
  }, new Map<string, SubstreamVote['vote']>());

  return (
    <div className="flex flex-col divide-y divide-grey-01">
      {proposals.map(p => {
        return (
          <Link
            key={p.id}
            href={`/space/${spaceId}/governance?proposalId=${p.id}`}
            className="flex w-full flex-col gap-4 py-6"
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-smallTitle">
                {getProposalName({
                  ...p,
                  name: p.name ?? p.id,
                  space: {
                    id: spaceId,
                    name: '',
                    image: '',
                  },
                })}
              </h3>
              <div className="flex items-center gap-2 text-breadcrumb text-grey-04">
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar avatarUrl={p.createdBy.avatarUrl} value={p.createdBy.address} />
                </div>
                <p>{p.createdBy.name ?? p.createdBy.id}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="inline-flex flex-[3] items-center gap-8">
                <GovernanceProposalVoteState
                  votes={{
                    totalCount: p.proposalVotes.totalCount,
                    votes: p.proposalVotes.votes,
                  }}
                  userVote={userVotesByProposalId.get(p.id)}
                  user={
                    profile || connectedAddress
                      ? {
                          address: connectedAddress,
                          avatarUrl: profile?.avatarUrl ?? null,
                        }
                      : undefined
                  }
                />
              </div>

              <GovernanceStatusChip
                endTime={p.endTime}
                status={p.status}
                yesVotesCount={p.proposalVotes.totalCount}
                noVotesCount={p.proposalVotes.totalCount}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export interface FetchActiveProposalsOptions {
  spaceId: string;
  page?: number;
  first?: number;
}

const SubstreamActiveProposal = Schema.extend(
  SubstreamProposal.omit('space'),
  Schema.Struct({ userVotes: Schema.Struct({ nodes: Schema.Array(SubstreamVote) }) })
);

type SubstreamActiveProposal = Schema.Schema.Type<typeof SubstreamActiveProposal>;

interface NetworkResult {
  activeProposals: {
    nodes: SubstreamActiveProposal[];
  };
  completedProposals: {
    nodes: SubstreamActiveProposal[];
  };
}

type ActiveProposal = {
  id: string;
  name: string | null;
  type: ProposalType;
  onchainProposalId: string;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    votes: SubstreamVote[];
  };
  userVotes: SubstreamVote[];
};

function ActiveProposalsDto(activeProposal: SubstreamActiveProposal, maybeProfile?: Profile): ActiveProposal {
  const profile = maybeProfile ?? {
    id: activeProposal.createdById,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: activeProposal.createdById as `0x${string}`,
    profileLink: null,
  };

  return {
    ...activeProposal,
    name: activeProposal.edit?.name ?? null,
    createdAt: activeProposal.edit?.createdAt ?? 0,
    createdAtBlock: activeProposal.edit?.createdAtBlock ?? '0',
    createdBy: profile,
    userVotes: activeProposal.userVotes.nodes.map(v => v), // remove readonly
    proposalVotes: {
      totalCount: activeProposal.proposalVotes.totalCount,
      votes: activeProposal.proposalVotes.nodes.map(v => v), // remove readonly
    },
  };
}

const getFetchActiveProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedAddress: string | undefined
) => `
  activeProposals: proposals(
    first: ${first}
    offset: ${skip}
    orderBy: END_TIME_DESC
    filter: {
      spaceId: { equalTo: "${spaceId}" }
      status: { equalTo: PROPOSED }
      endTime: { greaterThanOrEqualTo: ${Math.floor(Date.now() / 1000)} }
      or: [
        { type: { equalTo: ADD_EDIT } }
        { type: { equalTo: ADD_SUBSPACE } }
        { type: { equalTo: REMOVE_SUBSPACE } }
      ]
    }
  ) {
    nodes {
      id
      edit {
        id
        name
        createdAt
        createdAtBlock
      }
      type
      onchainProposalId

      createdById

      startTime
      endTime
      status

      proposalVotes {
        totalCount
        nodes {
          vote
          accountId
        }
      }

      userVotes: proposalVotes(
        filter: {
          accountId: { equalTo: "${connectedAddress ?? ''}" }
        }
      ) {
        nodes {
          vote
          accountId
        }
      }
    }
  }
`;

const getFetchCompletedProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedAddress: string | undefined
) => `
  completedProposals: proposals(
    first: ${first}
    offset: ${skip}
    orderBy: END_TIME_DESC
    filter: {
      spaceId: { equalTo: "${spaceId}" }
      status: { in: [ACCEPTED, REJECTED] }
      or: [
        { type: { equalTo: ADD_EDIT } }
        { type: { equalTo: ADD_SUBSPACE } }
        { type: { equalTo: REMOVE_SUBSPACE } }
      ]
    }
  ) {
    nodes {
      id
      edit {
        id
        name
        createdAt
        createdAtBlock
      }
      type
      onchainProposalId

      createdById

      startTime
      endTime
      status

      proposalVotes {
        totalCount
        nodes {
          vote
          accountId
        }
      }

      userVotes: proposalVotes(
        filter: {
          accountId: { equalTo: "${connectedAddress ?? ''}" }
        }
      ) {
        nodes {
          vote
          accountId
        }
      }
    }
  }
`;

const allProposalsQuery = (spaceId: string, first: number, skip: number, connectedAddress: string | undefined) => `
  query {
    ${getFetchActiveProposalsQuery(spaceId, first, skip, connectedAddress)}
    ${getFetchCompletedProposalsQuery(spaceId, first, skip, connectedAddress)}
  }
`;

async function fetchProposals({
  spaceId,
  connectedAddress,
  first = 5,
  page = 0,
}: {
  spaceId: string;
  first: number;
  page: number;
  connectedAddress: string | undefined;
}) {
  const offset = page * first;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: allProposalsQuery(spaceId, first, offset, connectedAddress),
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
            `Encountered runtime graphql error in governance proposals list. spaceId: ${spaceId} page: ${page}

            queryString: ${getFetchActiveProposalsQuery(spaceId, first, offset, connectedAddress)}
            `,
            error.message
          );
          return {
            activeProposals: {
              nodes: [],
            },
            completedProposals: {
              nodes: [],
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals, spaceId: ${spaceId} page: ${page}`);
          return {
            activeProposals: {
              nodes: [],
            },
            completedProposals: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposals = [...result.activeProposals.nodes, ...result.completedProposals.nodes];
  const profilesForProposals = await fetchProfilesByAddresses(proposals.map(p => p.createdById));

  return proposals.map(p => {
    const maybeProfile = profilesForProposals.find(profile => profile.address === p.createdById);

    return ActiveProposalsDto(p, maybeProfile);
  });
}
