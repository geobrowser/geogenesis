import Image from 'next/legacy/image';
import Link from 'next/link';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { fetchProfile } from '~/core/io/subgraph';
import {
  NavUtils,
  getImagePath,
  getNoVotePercentage,
  getProposalTimeRemaining,
  getYesVotePercentage,
  isProposalEnded,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Skeleton } from '~/design-system/skeleton';
import { TabGroup } from '~/design-system/tab-group';

import { Execute } from '~/partials/active-proposal/execute';

import { cachedFetchSpace } from '../space/[id]/cached-fetch-space';
import { AcceptOrRejectEditor } from './accept-or-reject-editor';
import { AcceptOrRejectMember } from './accept-or-reject-member';
import {
  ActiveProposalsForSpacesWhereEditor,
  getActiveProposalsForSpacesWhereEditor,
} from './fetch-active-proposals-in-editor-spaces';
import { fetchProposedMemberForProposal } from './fetch-proposed-member';
import { PersonalHomeDashboard } from './personal-home-dashboard';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  header: React.ReactNode;
  acceptedProposalsCount: number;
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
};

export async function Component({ header, acceptedProposalsCount, proposalType, connectedAddress }: Props) {
  return (
    <>
      <div className="mx-auto max-w-[784px]">
        {header}
        <PersonalHomeNavigation />
        <PersonalHomeDashboard
          proposalsList={
            <React.Suspense
              key={`${proposalType}-${connectedAddress}`}
              fallback={
                <div className="space-y-2">
                  <LoadingSkeleton />
                  <LoadingSkeleton />
                  <LoadingSkeleton />
                </div>
              }
            >
              <PendingProposals connectedAddress={connectedAddress} proposalType={proposalType} />
            </React.Suspense>
          }
          acceptedProposalsCount={acceptedProposalsCount}
        />
      </div>
    </>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

function NoActivity() {
  return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
}

function PersonalHomeNavigation() {
  return (
    <TabGroup
      tabs={TABS.map(label => {
        const href = label === 'For You' ? `/home` : `/home/${label.toLowerCase()}`;
        const disabled = label === 'For You' ? false : true;

        return {
          href,
          label,
          disabled,
        };
      })}
      className="mt-8"
    />
  );
}

type PendingProposalsProps = {
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
};

async function PendingProposals({ proposalType, connectedAddress }: PendingProposalsProps) {
  const [activeProposals, profile] = await Promise.all([
    getActiveProposalsForSpacesWhereEditor(connectedAddress, proposalType),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
  ]);

  if (activeProposals.proposals.length === 0) {
    return <NoActivity />;
  }

  const user =
    profile || connectedAddress
      ? {
          address: connectedAddress,
          avatarUrl: profile?.avatarUrl ?? undefined,
        }
      : null;

  return (
    <div className="space-y-2">
      {activeProposals.proposals.map(proposal => {
        switch (proposal.type) {
          case 'ADD_MEMBER':
          case 'REMOVE_MEMBER':
            return <PendingMembershipProposal key={proposal.id} proposal={proposal} user={user} />;
          default:
            return <PendingContentProposal key={proposal.id} proposal={proposal} user={user} />;
        }
      })}
    </div>
  );
}

type PendingMembershipProposalProps = {
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number];
  user: {
    address: string | undefined;
    avatarUrl: string | undefined;
  } | null;
};

async function PendingMembershipProposal({ proposal }: PendingMembershipProposalProps) {
  const [proposedMember, space] = await Promise.all([
    fetchProposedMemberForProposal(proposal.id),
    cachedFetchSpace(proposal.space!.id), // we know the space exists here. @TODO: Encode in type system
  ]);

  if (!proposedMember || !space) {
    // @TODO: Should never happen but we should error handle
    return null;
  }

  const ProfileHeader = proposedMember.profileLink ? (
    <Link href={proposedMember.profileLink} className="w-full">
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">{proposedMember.name ?? proposedMember.id}</div>
        <div className="relative h-5 w-5 overflow-hidden rounded-full">
          <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
        </div>
      </div>
    </Link>
  ) : (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">{proposedMember.name ?? proposedMember.id}</div>
        <div className="relative h-5 w-5 overflow-hidden rounded-full">
          <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        {ProfileHeader}

        <Link
          href={NavUtils.toSpace(proposal.space.id)}
          className="flex items-center gap-1.5 text-breadcrumb text-grey-04"
        >
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Image
                src={getImagePath(space.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE)}
                alt={`Cover image for space ${space.spaceConfig?.name ?? space.id}`}
                layout="fill"
                objectFit="cover"
              />
            </div>
            <p>{space.spaceConfig?.name}</p>
          </div>
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-metadataMedium">1 vote required</p>

        <AcceptOrRejectMember
          onchainProposalId={proposal.onchainProposalId}
          membershipContractAddress={space.memberAccessPluginAddress}
        />
      </div>
    </div>
  );
}

async function PendingContentProposal({ proposal, user }: PendingMembershipProposalProps) {
  const space = await cachedFetchSpace(proposal.space.id);

  if (!space) {
    // @TODO: Should never happen but we should error handle
    return null;
  }

  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);
  const votes = proposal.proposalVotes;

  const yesVotesPercentage = getYesVotePercentage(votes.nodes, votes.totalCount);
  const noVotesPercentage = getNoVotePercentage(votes.nodes, votes.totalCount);

  const userVote = proposal.userVotes.nodes.length !== 0 ? proposal.userVotes.nodes[0].vote : null;
  const isProposalDone = isProposalEnded(proposal.status, proposal.endTime);

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-grey-02 p-4">
      <Link href={NavUtils.toProposal(proposal.space.id, proposal.id)}>
        <div className="text-smallTitle">{proposal.name}</div>
      </Link>
      <div className="flex w-full items-center gap-1.5 text-breadcrumb text-grey-04">
        <div className="inline-flex items-center gap-3 text-breadcrumb text-grey-04">
          <p className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.id} />
            </div>
            <p>{proposal.createdBy.name ?? proposal.createdBy.id}</p>
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote === 'ACCEPT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
              <TickSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
          </div>
          <p>{yesVotesPercentage}%</p>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote === 'REJECT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
              <CloseSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
          </div>
          <p>{noVotesPercentage}%</p>
        </div>
      </div>
      <div className="flex w-full items-center justify-between">
        <p className="text-metadataMedium">{`${hours}h ${minutes}m remaining`}</p>

        {process.env.NODE_ENV === 'development' && isProposalDone && (
          <Execute
            contractAddress={space?.mainVotingPluginAddress as `0x${string}`}
            onchainProposalId={proposal.onchainProposalId}
          >
            Execute
          </Execute>
        )}

        {(proposal.type === 'ADD_EDITOR' || proposal.type === 'REMOVE_EDITOR') && !userVote && (
          <AcceptOrRejectEditor
            onchainProposalId={proposal.onchainProposalId}
            votingContractAddress={space?.mainVotingPluginAddress}
          />
        )}
      </div>
    </div>
  );
}
