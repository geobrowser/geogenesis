import { Effect, Either } from 'effect';
import { cookies } from 'next/headers';
import Link from 'next/link';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchProfile } from '~/core/io/subgraph';
import { tripleFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamEntity, SubstreamProposal, fromNetworkTriples } from '~/core/io/subgraph/network-local-mapping';
import { OmitStrict, Profile, Proposal, Vote } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';

interface Props {
  spaceId: string;
  page: number;
}

export async function GovernanceProposalsList({ spaceId, page }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const [proposals, profile] = await Promise.all([
    fetchActiveProposals({ spaceId, first: 5, page, connectedAddress }),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
  ]);

  const userVotesByProposalId = proposals.reduce((acc, p) => {
    if (p.userVotes.nodes.length === 0) return acc;

    return acc.set(p.id, p.userVotes.nodes[0].vote);
  }, new Map<string, Vote['vote']>());

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
              <h3 className="text-smallTitle">{p.name}</h3>
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
                    votes: p.proposalVotes.nodes,
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

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
}

interface NetworkResult {
  proposals: {
    nodes: OmitStrict<SubstreamProposal & { userVotes: { nodes: Vote[] } }, 'proposedVersions' | 'space'>[];
  };
}

const getFetchSpaceProposalsQuery = (
  spaceId: string,
  first: number,
  skip: number,
  connectedAddress: string | undefined
) => `query {
  proposals(
    first: ${first}
    offset: ${skip}
    orderBy: CREATED_AT_DESC
    filter: {
      spaceId: { equalTo: "${spaceId}" }
      or: [
        { type: { equalTo: CONTENT } }
        { type: { equalTo: ADD_SUBSPACE } }
        { type: { equalTo: REMOVE_SUBSPACE } }
      ]
    }
  ) {
    nodes {
      id
      onchainProposalId
      name

      createdAtBlock

      createdBy {
        id
        onchainProfiles {
          nodes {
            homeSpaceId
            id
          }
        }
        geoProfiles {
          nodes {
            id
            name
            triples(filter: {isStale: {equalTo: false}}) {
              nodes {
                ${tripleFragment}
              }
            }
          }
        }
      }

      createdAt
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
}`;

async function fetchActiveProposals({
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
    query: getFetchSpaceProposalsQuery(spaceId, first, offset, connectedAddress),
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
            `Encountered runtime graphql error in fetchProposals. spaceId: ${spaceId} page: ${page}
            
            queryString: ${getFetchSpaceProposalsQuery(spaceId, first, offset, connectedAddress)}
            `,
            error.message
          );
          return {
            proposals: {
              nodes: [],
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals, spaceId: ${spaceId} page: ${page}`);
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

  return proposals.map(p => {
    const maybeProfile = p.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
    const onchainProfile = p.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
    const profileTriples = fromNetworkTriples(maybeProfile?.triples.nodes ?? []);

    const profile: Profile = maybeProfile
      ? {
          id: p.createdBy.id,
          address: p.createdBy.id as `0x${string}`,
          avatarUrl: Entity.avatar(profileTriples),
          coverUrl: Entity.cover(profileTriples),
          name: maybeProfile.name,
          profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
        }
      : {
          id: p.createdBy.id,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: p.createdBy.id as `0x${string}`,
          profileLink: null,
        };

    return {
      ...p,
      createdBy: profile,
    };
  });
}
