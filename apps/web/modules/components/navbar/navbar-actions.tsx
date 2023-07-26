'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';

import { GeoConnectButton } from '~/modules/wallet';
import { Avatar } from '~/modules/design-system/avatar';
import { Menu } from '~/modules/design-system/menu';
import { useQuery } from '@tanstack/react-query';
import { Services } from '~/modules/services';
import { useEditable } from '~/modules/stores/use-editable';
import { EyeSmall } from '~/modules/design-system/icons/eye-small';
import { BulkEdit } from '~/modules/design-system/icons/bulk-edit';
import { NotificationEmpty } from '~/modules/design-system/icons/notification-empty';
import { cva } from 'class-variance-authority';

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
      <ModeToggle />

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
        <AvatarMenuItem disabled>
          <div className="flex items-center gap-2 grayscale">
            <Avatar value={address} avatarUrl={profile?.avatarUrl} size={16} />
            <p className="text-button">Personal Space</p>
          </div>
        </AvatarMenuItem>

        <AvatarMenuItem disabled>
          <div className="flex items-center gap-2 grayscale">
            <NotificationEmpty />
            <p className="text-button">Notifications</p>
          </div>
        </AvatarMenuItem>
        <AvatarMenuItem>
          <GeoConnectButton />
        </AvatarMenuItem>
      </Menu>
    </div>
  );
}

const avatarMenuItemStyles = cva(
  'flex w-full select-none items-center justify-between bg-white py-2 px-3 text-button hover:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-03',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-03',
        false: 'cursor-pointer text-grey-04 hover:text-text hover:bg-bg',
      },
    },
    defaultVariants: {
      disabled: false,
    },
  }
);

function AvatarMenuItem({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={avatarMenuItemStyles({ disabled })}>
      {children}
    </button>
  );
}

function ModeToggle() {
  // @TODO: This should only be toggle-able if they have edit access
  // @TODO: Animation when they don't have edit access
  const { editable, setEditable } = useEditable();

  return (
    <button
      onClick={() => setEditable(!editable)}
      className="flex w-[66px] items-center justify-between rounded-[47px] bg-divider p-1"
    >
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {!editable && <AnimatedTogglePill />}
        <motion.div className={`z-10 transition-colors duration-300 ${!editable ? 'text-text' : 'text-grey-03'}`}>
          <EyeSmall />
        </motion.div>
      </div>
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {editable && <AnimatedTogglePill />}
        <motion.div className={`z-10 transition-colors duration-300 ${editable ? 'text-text' : 'text-grey-03'}`}>
          <BulkEdit />
        </motion.div>
      </div>
    </button>
  );
}

function AnimatedTogglePill() {
  return (
    <motion.div
      transition={{
        type: 'spring',
        duration: 0.15,
        bounce: 0,
      }}
      layoutId="edit-toggle"
      className="absolute h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
    />
  );
}
