import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';
import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Metadata } from 'next';

import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createPublicClient, http } from 'viem';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { cachedFetchProposal } from '~/core/io/subgraph';
import { graphql } from '~/core/io/subgraph/graphql';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { ActiveProposal } from '~/partials/active-proposal/active-proposal';
import {
  type GovernanceProposalType,
  GovernanceProposalTypeFilter,
} from '~/partials/governance/governance-proposal-type-filter';
import { GovernanceProposalsList } from '~/partials/governance/governance-proposals-list';
import { GovernanceProposalsListInfiniteScroll } from '~/partials/governance/governance-proposals-list-infinite-scroll';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proposalId?: string; proposalType?: GovernanceProposalType }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    return { title: 'Not Found' };
  }

  const space = await cachedFetchSpace(spaceId);
  const spaceName = space?.entity?.name ?? `Space ${spaceId}`;

  if (searchParams.proposalId) {
    const proposal = await cachedFetchProposal({ id: searchParams.proposalId });
    const proposalName = proposal?.name;

    if (proposalName) {
      return {
        title: `${proposalName} (${spaceName})`,
      };
    }
  }

  return {
    title: `${spaceName} Governance`,
  };
}

async function fetchVotingSettings(spaceId: string) {
  try {
    const space = await cachedFetchSpace(spaceId);
    if (!space?.address) return null;

    const publicClient = createPublicClient({
      chain: GEOGENESIS,
      transport: http(),
    });

    const settings = await publicClient.readContract({
      address: space.address as `0x${string}`,
      abi: DaoSpaceAbi,
      functionName: 'votingSettings',
    });

    return settings;
  } catch {
    return null;
  }
}

function formatDuration(seconds: bigint): string {
  const totalHours = Number(seconds) / 3600;

  if (totalHours >= 1 && totalHours === Math.floor(totalHours)) {
    return `${totalHours}h`;
  }

  return `${Math.round(Number(seconds) / 60)}m`;
}

function formatThreshold(ratioValue: bigint): string {
  // RATIO_BASE is 10^7, so divide by 100000 to get percentage
  const percentage = Number(ratioValue) / 100000;

  if (percentage === Math.floor(percentage)) {
    return `${percentage}%`;
  }

  return `${percentage.toFixed(1)}%`;
}

export default async function GovernancePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [{ acceptedProposals, rejectedProposals, activeProposals }, votingSettings] = await Promise.all([
    getProposalsCount({ id: params.id }),
    fetchVotingSettings(params.id),
  ]);

  const votingPeriod = votingSettings ? formatDuration(votingSettings.duration) : '24h';
  const passThreshold = votingSettings ? formatThreshold(votingSettings.slowPathPercentageThreshold) : '51%';

  const proposalType = searchParams.proposalType;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-5">
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Voting period</h2>
            <p className="text-mediumTitle">{votingPeriod}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Pass threshold</h2>
            <p className="text-mediumTitle">{passThreshold}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Active proposals</h2>
            <p className="text-mediumTitle">{activeProposals.totalCount}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Accepted vs. rejected</h2>
            <div className="flex items-center gap-3 text-mediumTitle">
              <span>{acceptedProposals.totalCount}</span>
              <div className="h-4 w-px bg-grey-02" />
              <span>{rejectedProposals.totalCount}</span>
            </div>
          </GovernanceMetadataBox>
        </div>
        <GovernanceProposalTypeFilter spaceId={params.id} />
        <React.Suspense fallback="Loading initial...">
          <InitialGovernanceProposals spaceId={params.id} proposalType={proposalType} />
        </React.Suspense>
      </div>

      <ActiveProposal connectedAddress={connectedAddress} spaceId={params.id} proposalId={searchParams.proposalId} />
    </>
  );
}

function GovernanceMetadataBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-1 rounded-lg border border-grey-02 py-3">{children}</div>
  );
}

async function InitialGovernanceProposals({
  spaceId,
  proposalType,
}: {
  spaceId: string;
  proposalType?: GovernanceProposalType;
}) {
  const { node, hasMore } = await GovernanceProposalsList({ spaceId, page: 0, proposalType });

  return (
    <>
      {node}
      {hasMore && (
        <GovernanceProposalsListInfiniteScroll
          spaceId={spaceId}
          page={0}
          initialHasMore={hasMore}
          proposalType={proposalType}
        />
      )}
    </>
  );
}

interface NetworkResult {
  activeProposals: {
    totalCount: number;
  };
  acceptedProposals: {
    totalCount: number;
  };
  rejectedProposals: {
    totalCount: number;
  };
}

async function getProposalsCount({ id }: Awaited<Props['params']>) {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: `
    query {
      activeProposals: proposalsConnection(
        filter: {
          spaceId: { is: "${id}" }
          endTime: { greaterThanOrEqualTo: "${nowSeconds}" }
          executedAt: { isNull: true }
        }
      ) {
        totalCount
      }

      acceptedProposals: proposalsConnection(
        filter: {
          spaceId: { is: "${id}" }
          executedAt: { isNull: false }
        }
      ) {
        totalCount
      }

      rejectedProposals: proposalsConnection(
        filter: {
          spaceId: { is: "${id}" }
          endTime: { lessThan: "${nowSeconds}" }
          executedAt: { isNull: true }
        }
      ) {
        totalCount
      }
    }`,
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
          console.error(`Encountered runtime graphql error in governance/page. spaceId: ${id}`, error.message);
          return {
            activeProposals: {
              totalCount: 0,
            },
            acceptedProposals: {
              totalCount: 0,
            },
            rejectedProposals: {
              totalCount: 0,
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals count, spaceId: ${id}`);
          return {
            activeProposals: {
              totalCount: 0,
            },
            acceptedProposals: {
              totalCount: 0,
            },
            rejectedProposals: {
              totalCount: 0,
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  return result;
}
