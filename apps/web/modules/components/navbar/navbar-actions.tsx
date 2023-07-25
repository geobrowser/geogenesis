import * as React from 'react';
import { useAccount } from 'wagmi';

import { GeoConnectButton } from '~/modules/wallet';
import { Avatar } from '~/modules/design-system/avatar';
import { Menu } from '~/modules/design-system/menu';
import { useQuery } from '@tanstack/react-query';
import { Services } from '~/modules/services';

function useUserProfile(address?: string) {
  const { network } = Services.useServices();

  // @TODO: Merge with local data
  const { data } = useQuery({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      if (!address) return null;
      return await network.fetchProfile(address);
    },
  });

  return data ? data[1] : null;
}

export function NavbarActions() {
  const [open, onOpenChange] = React.useState(false);
  const { address } = useAccount();
  const profile = useUserProfile(address);

  if (!address) {
    return <GeoConnectButton />;
  }

  return (
    <div className="flex items-center gap-4">
      <Menu
        trigger={
          <div className="relative h-7 w-7 overflow-hidden rounded-full">
            <Avatar value={address} avatarUrl={profile?.avatarUrl} size={28} />
          </div>
        }
        open={open}
        onOpenChange={onOpenChange}
        className="w-[165px]"
      >
        <AvatarMenuItem>
          <GeoConnectButton />
        </AvatarMenuItem>
      </Menu>
    </div>
  );
}

function AvatarMenuItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex select-none items-center justify-between bg-white py-2 px-3 text-button text-grey-04 hover:bg-bg hover:text-text hover:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04">
      {children}
    </div>
  );
}
