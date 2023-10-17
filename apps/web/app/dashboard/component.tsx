'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import { useWalletClient } from 'wagmi';
import { useAccount } from 'wagmi';

import { useLocalStorage } from '~/core/hooks/use-local-storage';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Publish } from '~/core/io';
import type { MembershipRequest} from '~/core/io/subgraph/fetch-interim-membership-requests';
import { Services } from '~/core/services';
import type { Space } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { TabGroup } from '~/design-system/tab-group';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  membershipRequests: MembershipRequest[];
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

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 overflow-hidden rounded-sm bg-grey-01">
          <Avatar value={address} avatarUrl={profile?.avatarUrl} size={56} square={true} />
        </div>
        <h2 className="text-largeTitle">{profile?.name ?? 'Anonymous'}</h2>
      </div>
      <div>
        <SmallButton className="!bg-transparent !text-text">View personal space</SmallButton>
      </div>
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
  membershipRequests: MembershipRequest[];
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
  membershipRequests: MembershipRequest[];
};

const PendingRequests = ({ membershipRequests }: PendingRequestsProps) => {
  return (
    <div className="space-y-4">
      {membershipRequests.map((request: MembershipRequest) => (
        <MembershipRequest key={request.id} request={request} />
      ))}
    </div>
  );
};

type MembershipRequestProps = {
  request: MembershipRequest;
};

const MembershipRequest = ({ request }: MembershipRequestProps) => {
  const [dismissedRequests, setDismissedRequests] = useLocalStorage<Array<string>>('dismissedRequests', []);
  const { spaces } = useSpaces();
  const address = request.requestor;
  const profile = useUserProfile(address);

  const { data: wallet } = useWalletClient();

  const handleAccept = async () => {
    if (wallet && request.space && address) {
      const roleToChange = await Publish.getRole(request.space, 'EDITOR_ROLE');
      await Publish.grantRole({ spaceId: request.space, role: roleToChange, wallet, userAddress: address as string });
    }
  };

  const handleReject = () => {
    if (!dismissedRequests.includes(request.id)) {
      const newDismissedRequests = [...dismissedRequests, request.id]
      setDismissedRequests(newDismissedRequests);
    }
  };

  if (dismissedRequests.includes(request.id)) {
    return null;
  }

  return (
    <ClientOnly>
      <div className="space-y-4 rounded-lg border border-grey-02 p-4">
        <div className="flex items-center justify-between">
          <div className="text-smallTitle">{profile?.name ?? address}</div>
          <div className="relative h-5 w-5 overflow-hidden rounded-full">
            <Avatar value={address} avatarUrl={profile?.avatarUrl} size={20} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-breadcrumb text-grey-04">
          <span className="relative h-3 w-3 overflow-hidden rounded-sm">
            <img
              src={getSpaceImage(spaces, request.space)}
              className="absolute inset-0 h-full w-full object-cover object-center"
              alt=""
            />
          </span>
          <span>{spaces.find(({ id }) => id === request.space)?.attributes.name ?? 'Space'}</span>
        </div>
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

// @TODO convert to reusable hook and share with `navbar-actions.tsx`
function useUserProfile(address?: string) {
  const { subgraph, config } = Services.useServices();

  const { data } = useQuery({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      if (!address) return null;
      return await subgraph.fetchProfile({ address, endpoint: config.subgraph });
    },
  });

  return data ? data[1] : null;
}

// @TODO convert to reusable util and share with `review.tsx`
function getSpaceImage(spaces: Space[], spaceId: string): string {
  return getImagePath(
    spaces.find(({ id }) => id === spaceId)?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ??
      'https://via.placeholder.com/600x600/FF00FF/FFFFFF'
  );
}
