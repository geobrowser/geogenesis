'use client';

import Link from 'next/link';

import { useAccount, useWalletClient } from 'wagmi';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useLocalStorage } from '~/core/hooks/use-local-storage';
import { usePerson } from '~/core/hooks/use-person';
import { Publish } from '~/core/io';
import type { MembershipRequestWithProfile } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { useActiveProposal } from '~/core/state/active-proposal-store';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';
import { Time } from '~/design-system/icons/time';
import { TabGroup } from '~/design-system/tab-group';

import { ActiveProposal } from '~/partials/active-proposal/active-proposal';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  activeProposals: any[];
  membershipRequests: MembershipRequestWithProfile[];
};

export const Component = ({ activeProposals, membershipRequests }: Props) => {
  return (
    <>
      <div className="mx-auto max-w-[784px]">
        <PersonalHomeHeader />
        <PersonalHomeNavigation />
        <PersonalHomeDashboard activeProposals={activeProposals} membershipRequests={membershipRequests} />
      </div>
      <ActiveProposal />
    </>
  );
};

const PersonalHomeHeader = () => {
  const { address } = useAccount();
  const profile = usePerson(address);
  const { profile: onchainProfile } = useGeoProfile(address);

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 overflow-hidden rounded-sm bg-grey-01">
          <Avatar value={address} avatarUrl={profile?.avatarUrl} size={56} square={true} />
        </div>
        <h2 className="text-largeTitle">{profile?.name ?? 'Anonymous'}</h2>
      </div>
      {onchainProfile?.homeSpace && (
        <Link href={NavUtils.toSpace(onchainProfile.homeSpace)}>
          <SmallButton className="!bg-transparent !text-text">View personal space</SmallButton>
        </Link>
      )}
    </div>
  );
};

const PersonalHomeNavigation = () => {
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
};

type PersonalHomeDashboardProps = {
  activeProposals: any[];
  membershipRequests: MembershipRequestWithProfile[];
};

const PersonalHomeDashboard = ({ activeProposals, membershipRequests }: PersonalHomeDashboardProps) => {
  return (
    <div className="mt-8 flex gap-8">
      <div className="w-2/3">
        <PendingProposals activeProposals={activeProposals} />
        <PendingRequests membershipRequests={membershipRequests} />
      </div>
      <div className="w-1/3">{/* dashboard sidebar */}</div>
    </div>
  );
};

type PendingProposalsProps = {
  activeProposals: any[];
};

const PendingProposals = ({ activeProposals }: PendingProposalsProps) => {
  if (activeProposals.length === 0) {
    return <p className="text-body text-grey-04">There are no active proposals in any of your spaces.</p>;
  }

  return (
    <div className="space-y-4">
      {activeProposals.map(proposal => (
        <PendingProposal key={proposal} proposal={proposal} />
      ))}
    </div>
  );
};

type PendingProposalProps = {
  proposal: any;
};

const PendingProposal = ({ proposal }: PendingProposalProps) => {
  const { setIsActiveProposalOpen, setActiveProposalId } = useActiveProposal();

  const handleOpenActiveProposal = () => {
    setActiveProposalId('someId');
    setIsActiveProposalOpen(true);
  };

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <button onClick={handleOpenActiveProposal}>
        <div className="text-smallTitle">Changes to x, y, and z across several pages</div>
      </button>
      <Link href="" className="flex items-center gap-1.5 text-breadcrumb text-grey-04">
        <div className="inline-flex items-center gap-3 text-breadcrumb text-grey-04">
          <Link href={''} className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={''} value={''} />
            </div>
            <p>Anonymous</p>
          </Link>
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <img src="/mosaic.png" alt="" className="h-full w-full object-cover" />
            </div>
            <p>Space</p>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex gap-1.5 rounded bg-grey-01 px-1.5 py-1 text-smallButton text-xs leading-none">
            <Time />
            <span>6h 30m remaining</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-2">
          <SmallButton onClick={() => null}>Reject</SmallButton>
          <SmallButton onClick={() => null}>Accept</SmallButton>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Tick />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: '75%' }} />
          </div>
          <div>75%</div>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Close />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: '25%' }} />
          </div>
          <div>25%</div>
        </div>
      </div>
    </div>
  );
};

type PendingRequestsProps = {
  membershipRequests: MembershipRequestWithProfile[];
};

const PendingRequests = ({ membershipRequests }: PendingRequestsProps) => {
  const [dismissedRequests, setDismissedRequests] = useLocalStorage<Array<string>>('dismissedRequests', []);

  if (membershipRequests.length === 0) {
    return <p className="text-body text-grey-04">There are no pending requests in any of your spaces.</p>;
  }

  const dismissedSet = new Set(dismissedRequests);

  const onRequestProcessed = (requestId: string) => {
    if (!dismissedSet.has(requestId)) {
      const newDismissedRequests = [...dismissedRequests, requestId];
      setDismissedRequests(newDismissedRequests);
    }
  };

  return (
    <div className="space-y-4">
      {membershipRequests
        .filter(r => !dismissedSet.has(r.id))
        .map(request => (
          <MembershipRequest key={request.id} request={request} onRequestProcessed={onRequestProcessed} />
        ))}
    </div>
  );
};

type MembershipRequestProps = {
  request: MembershipRequestWithProfile;
  onRequestProcessed: (requestId: string) => void;
};

const MembershipRequest = ({ request, onRequestProcessed }: MembershipRequestProps) => {
  const profile = request.requestor;

  const { data: wallet } = useWalletClient();

  const handleAccept = async () => {
    if (wallet && request.space && profile.id) {
      const roleToChange = await Publish.getRole(request.space.id, 'EDITOR_ROLE');
      await Publish.grantRole({ spaceId: request.space.id, role: roleToChange, wallet, userAddress: profile.address });
      onRequestProcessed(request.id);
    }
  };

  const handleReject = () => {
    onRequestProcessed(request.id);
  };

  return (
    <ClientOnly>
      <div className="space-y-4 rounded-lg border border-grey-02 p-4">
        <Link href={profile?.profileLink ?? ''} className="flex items-center justify-between">
          <div className="text-smallTitle">{profile?.name ?? profile.id}</div>
          <div className="relative h-5 w-5 overflow-hidden rounded-full">
            <Avatar value={profile.id} avatarUrl={profile?.avatarUrl} size={20} />
          </div>
        </Link>
        <Link
          href={NavUtils.toSpace(request.space.id)}
          className="flex items-center gap-1.5 text-breadcrumb text-grey-04"
        >
          <span className="relative h-3 w-3 overflow-hidden rounded-sm">
            <img
              src={request.space.image ? getImagePath(request.space.image) : undefined}
              className="absolute inset-0 h-full w-full object-cover object-center"
              alt=""
            />
          </span>
          <span>{request.space.name ?? 'Space'}</span>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="gap-1.5 rounded bg-grey-01 px-1.5 py-1 text-smallButton text-xs leading-none">
              Member request 0/1 votes needed
            </div>
          </div>
          <div className="inline-flex items-center gap-2">
            <SmallButton onClick={handleReject}>Reject</SmallButton>
            <SmallButton onClick={handleAccept}>Accept</SmallButton>
          </div>
        </div>
      </div>
    </ClientOnly>
  );
};
