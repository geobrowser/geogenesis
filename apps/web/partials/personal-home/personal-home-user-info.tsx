'use client';

import { value } from 'effect/ConfigSecret';

import { useAccount, useQuery } from 'wagmi';

import { Services } from '~/core/services';

import { Avatar } from '~/design-system/avatar';

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

export function PersonalHomeUserInfo() {
  const { address } = useAccount();
  const profile = useUserProfile(address);
  console.log('profile', profile);
  return (
    <div className="flex flex-row items-center gap-4">
      <div className="relative rounded-sm overflow-hidden w-14 h-14">
        <Avatar value={address} avatarUrl={profile?.avatarUrl} size={28} />
      </div>
      <h1 className="text-largeTitle">{profile?.name}</h1>
    </div>
  );
}
