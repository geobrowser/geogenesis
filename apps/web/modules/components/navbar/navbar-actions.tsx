import * as React from 'react';
import { useAccount } from 'wagmi';

import { GeoConnectButton } from '~/modules/wallet';
import { Avatar } from '~/modules/design-system/avatar';
import { Menu } from '~/modules/design-system/menu';

export function NavbarActions() {
  const [open, onOpenChange] = React.useState(false);
  const { address } = useAccount();

  if (!address) {
    return <GeoConnectButton />;
  }

  return (
    <div className="flex items-center gap-4">
      <Menu
        trigger={<Avatar value={address} size={28} />}
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
