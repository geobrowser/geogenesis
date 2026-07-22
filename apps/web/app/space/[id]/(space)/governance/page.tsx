import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';
import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Metadata } from 'next';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createPublicClient, http } from 'viem';

import { WALLET_ADDRESS } from '~/core/cookie';
import { cachedFetchProposal } from '~/core/io/subgraph';
import { getMembershipProposalDisplayName } from '~/core/utils/utils';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { ActiveProposal } from '~/partials/active-proposal/active-proposal';
import { EditGovernanceSettings } from '~/partials/governance/edit-governance-settings';
import {
  type GovernanceProposalType,
  GovernanceProposalTypeFilter,
} from '~/partials/governance/governance-proposal-type-filter';
import { GovernanceProposalsList } from '~/partials/governance/governance-proposals-list';
import { GovernanceProposalsListInfiniteScroll } from '~/partials/governance/governance-proposals-list-infinite-scroll';
import type { VotingSettingsSnapshot } from '~/partials/governance/voting-settings';

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
    const proposalName = proposal?.targetProfile
      ? getMembershipProposalDisplayName(proposal.type, proposal.targetProfile)
      : proposal?.name;

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
  const [votingSettings, space] = await Promise.all([fetchVotingSettings(params.id), cachedFetchSpace(params.id)]);

  // The four settings the governance design surfaces (design 62569-13445).
  const votingPeriod = votingSettings ? formatDuration(votingSettings.duration) : '24h';
  const passThreshold = votingSettings ? formatThreshold(votingSettings.partialPercentageSupportThreshold) : '51%';
  const universalThreshold = votingSettings ? formatThreshold(votingSettings.universalPercentageSupportThreshold) : '100%';
  const fastPassThreshold = votingSettings ? String(Number(votingSettings.flatSupportThreshold)) : '—';
  const quorum = votingSettings ? String(Number(votingSettings.quorum)) : '—';

  // Plain, serializable copy of the on-chain settings for the (client) edit modal — the
  // raw struct is all bigints, which can't cross the server/client boundary. RATIO_BASE
  // is 1e7 on-chain, so a ratio / 100000 is its percentage (see formatThreshold).
  const votingSettingsSnapshot: VotingSettingsSnapshot | null = votingSettings
    ? {
        partialPercent: Number(votingSettings.partialPercentageSupportThreshold) / 100000,
        universalPercent: Number(votingSettings.universalPercentageSupportThreshold) / 100000,
        flat: Number(votingSettings.flatSupportThreshold),
        quorum: Number(votingSettings.quorum),
        durationSeconds: Number(votingSettings.duration),
        graceDays: Number(votingSettings.executionGracePeriod) / 86400,
        disableFastPathForNewMembers: votingSettings.disableFastPathAccessForNewMembers,
      }
    : null;

  const canEditGovernance = space?.type === 'DAO' && Boolean(space.address) && votingSettingsSnapshot !== null;

  const proposalType = searchParams.proposalType;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-stretch gap-5">
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Vote duration</h2>
            <p className="text-mediumTitle">{votingPeriod}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Pass threshold</h2>
            <p className="text-mediumTitle">{passThreshold}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Universal threshold</h2>
            <p className="text-mediumTitle">{universalThreshold}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Fast pass threshold</h2>
            <p className="text-mediumTitle">{fastPassThreshold}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Quorum</h2>
            <p className="text-mediumTitle">{quorum}</p>
          </GovernanceMetadataBox>
        </div>
        <div className="flex items-center justify-between">
          <GovernanceProposalTypeFilter spaceId={params.id} />
          {canEditGovernance && space?.address && votingSettingsSnapshot && (
            <EditGovernanceSettings
              spaceId={params.id}
              daoSpaceAddress={space.address}
              snapshot={votingSettingsSnapshot}
            />
          )}
        </div>
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
