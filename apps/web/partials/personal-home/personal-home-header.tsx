'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccount } from 'wagmi';

import { Services } from '~/core/services';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';

function useUserProfile(address?: string) {
  const { subgraph, config } = Services.useServices();

  // @TODO: Merge with local data
  const { data } = useQuery({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      if (!address) return null;
      return await subgraph.fetchProfile({ address, endpoint: config.subgraph });
    },
  });

  return data ? data[1] : null;
}

export function PersonalHomeHeader() {
  const { address } = useAccount();
  const profile = useUserProfile(address);
  return (
    <div className="flex flex-row items-center justify-between w-full mb-10">
      <div className="flex flex-row items-center gap-4 ">
        <div className="relative rounded-sm overflow-hidden w-14 h-14">
          <Avatar value={address} avatarUrl={profile?.avatarUrl} size={28} />
        </div>
        <h1 className="text-largeTitle">{profile?.name}</h1>
      </div>
      <div>
        <SmallButton className="text-text bg-transparent">View personal space</SmallButton>
      </div>
    </div>
  );
}
