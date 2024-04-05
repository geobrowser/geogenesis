'use client';

import Image from 'next/legacy/image';
import Link from 'next/link';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  NavUtils,
  getImagePath,
  getNoVotePercentage,
  getProposalTimeRemaining,
  getYesVotePercentage,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Member } from '~/design-system/icons/member';
import { Tick } from '~/design-system/icons/tick';
import { Time } from '~/design-system/icons/time';
import { TabGroup } from '~/design-system/tab-group';

import { cachedFetchSpace } from '../space/[id]/cached-fetch-space';
import { ActiveProposalsForSpacesWhereEditor } from './fetch-active-proposals-in-editor-spaces';
import { fetchProposedMemberForProposal } from './fetch-proposed-member';
import { PersonalHomeDashboard } from './personal-home-dashboard';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  header: React.ReactNode;
  activeProposals: ActiveProposalsForSpacesWhereEditor;
  acceptedProposalsCount: number;
};

export function Component({ header, activeProposals, acceptedProposalsCount }: Props) {
  return (
    <>
      <div className="mx-auto max-w-[784px]">
        {header}
        <PersonalHomeNavigation />
        <PersonalHomeDashboard
          proposalsList={
            <React.Suspense fallback="Loading...">
              <PendingProposals activeProposals={activeProposals} />
            </React.Suspense>
          }
          activeProposals={activeProposals}
          acceptedProposalsCount={acceptedProposalsCount}
        />
      </div>
    </>
  );
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
  activeProposals: ActiveProposalsForSpacesWhereEditor;
};

function PendingProposals({ activeProposals }: PendingProposalsProps) {
  if (activeProposals.proposals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {activeProposals.proposals.map(proposal => {
        switch (proposal.type) {
          case 'ADD_EDITOR':
          case 'ADD_MEMBER':
          case 'REMOVE_EDITOR':
          case 'REMOVE_MEMBER':
            return <PendingMembershipProposal key={proposal.id} proposal={proposal} />;
          default:
            return <PendingContentProposal key={proposal.id} proposal={proposal} />;
        }
      })}
    </div>
  );
}

type PendingMembershipProposalProps = {
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number];
};

async function PendingMembershipProposal({ proposal }: PendingMembershipProposalProps) {
  const [proposedMember, space] = await Promise.all([
    fetchProposedMemberForProposal(proposal.id),
    cachedFetchSpace(proposal.spaceId),
  ]);

  if (!proposedMember || !space) {
    // @TODO: Should never happen but we should error handle
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Link href={proposedMember.profileLink ?? ''} className="w-full">
          <div className="flex items-center justify-between">
            <div className="text-smallTitle">{proposedMember.name ?? proposedMember.id}</div>
            <div className="relative h-5 w-5 overflow-hidden rounded-full">
              <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
            </div>
          </div>
        </Link>

        <Link
          href={NavUtils.toSpace(proposal.spaceId)}
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
        <div className="inline-flex items-center gap-1.5 rounded bg-grey-01 px-2 py-1.5 text-breadcrumb text-grey-04">
          <Member />
          <span>Member request · 0/1 votes needed</span>
        </div>
        <div className="flex items-center gap-2">
          <SmallButton variant="secondary">Reject</SmallButton>
          <SmallButton variant="secondary">Approve</SmallButton>
        </div>
      </div>
    </div>
  );
}

const PendingContentProposal = ({ proposal }: PendingMembershipProposalProps) => {
  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);
  const votes = proposal.proposalVotes;

  const yesVotesPercentage = getYesVotePercentage(votes.nodes, votes.totalCount);
  const noVotesPercentage = getNoVotePercentage(votes.nodes, votes.totalCount);

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <button>
        <div className="text-smallTitle">{proposal.name}</div>
      </button>
      <Link
        href={`/space/${proposal.spaceId}/governance?proposalId=${proposal.id}`}
        className="flex items-center gap-1.5 text-breadcrumb text-grey-04"
      >
        <div className="inline-flex items-center gap-3 text-breadcrumb text-grey-04">
          <Link href={''} className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={''} value={''} />
            </div>
            <p>{proposal.createdBy.name}</p>
          </Link>
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <img src="/mosaic.png" alt="" className="h-full w-full object-cover" />
            </div>
            <p>{proposal.spaceId}</p>
          </div>
        </div>
      </Link>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Tick />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
          </div>
          <p>{yesVotesPercentage}%</p>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Close />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
          </div>
          <p>{noVotesPercentage}%</p>
        </div>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded bg-grey-01 px-2 py-1.5 text-smallButton">
        <Time />
        <span>{`${hours}h ${minutes}m remaining`}</span>
      </div>
    </div>
  );
};
