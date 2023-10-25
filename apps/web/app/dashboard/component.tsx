'use client';

import Link from 'next/link';

import { useWalletClient } from 'wagmi';
import { useAccount } from 'wagmi';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useLocalStorage } from '~/core/hooks/use-local-storage';
import { useUserProfile } from '~/core/hooks/use-user-profile';
import { Publish } from '~/core/io';
import type { MembershipRequestWithProfile } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { TabGroup } from '~/design-system/tab-group';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  membershipRequests: MembershipRequestWithProfile[];
};

export const Component = ({ membershipRequests }: Props) => {
  return (
    <div className="mx-auto max-w-[784px]">
      <PersonalHomeHeader />
      <PersonalHomeNavigation />
      <PersonalHomeDashboard membershipRequests={membershipRequests} />
    </div>
  );
};

const PersonalHomeHeader = () => {
  const { address } = useAccount();
  const profile = useUserProfile(address);
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
        const href = label === 'For You' ? `/dashboard` : `/dashboard/${label.toLowerCase()}`;
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
  membershipRequests: MembershipRequestWithProfile[];
};

const PersonalHomeDashboard = ({ membershipRequests }: PersonalHomeDashboardProps) => {
  return (
    <div className="mt-8 flex gap-8">
      <div className="w-2/3">
        <PendingRequests membershipRequests={membershipRequests} />
      </div>
      <div className="w-1/3">{/* dashboard sidebar */}</div>
    </div>
  );
};

type PendingRequestsProps = {
  membershipRequests: MembershipRequestWithProfile[];
};

const PendingRequests = ({ membershipRequests }: PendingRequestsProps) => {
  if (membershipRequests.length === 0) {
    return <p className="text-body text-grey-04">There are no pending requests in any of your spaces.</p>;
  }

  return (
    <div className="space-y-4">
      {membershipRequests.map(request => (
        <MembershipRequest key={request.id} request={request} />
      ))}
    </div>
  );
};

type MembershipRequestProps = {
  request: MembershipRequestWithProfile;
};

const MembershipRequest = ({ request }: MembershipRequestProps) => {
  const [dismissedRequests, setDismissedRequests] = useLocalStorage<Array<string>>('dismissedRequests', []);
  const profile = request.requestor;

  const { data: wallet } = useWalletClient();

  const handleAccept = async () => {
    if (wallet && request.space && profile.id) {
      const roleToChange = await Publish.getRole(request.space.id, 'EDITOR_ROLE');
      await Publish.grantRole({ spaceId: request.space.id, role: roleToChange, wallet, userAddress: profile.address });
      const newDismissedRequests = [...dismissedRequests, request.id];
      setDismissedRequests(newDismissedRequests);
    }
  };

  const handleReject = () => {
    if (!dismissedRequests.includes(request.id)) {
      const newDismissedRequests = [...dismissedRequests, request.id];
      setDismissedRequests(newDismissedRequests);
    }
  };

  if (dismissedRequests.includes(request.id)) {
    return null;
  }

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
