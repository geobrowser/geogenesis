'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { cva } from 'class-variance-authority';
import { AnimatePresence, AnimationControls, motion, useAnimation } from 'framer-motion';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Services } from '~/core/services';
import { useEditable } from '~/core/state/editable-store/editable-store';
import { GeoConnectButton } from '~/core/wallet';

import { Avatar } from '~/design-system/avatar';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { NotificationEmpty } from '~/design-system/icons/notification-empty';
import { Menu } from '~/design-system/menu';

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

interface Props {
  spaceId?: string;
}

export function NavbarActions({ spaceId }: Props) {
  const [open, onOpenChange] = React.useState(false);

  const { address } = useAccount();
  const profile = useUserProfile(address);

  if (!address) {
    return <GeoConnectButton />;
  }

  return (
    <div className="flex items-center gap-4">
      <ModeToggle spaceId={spaceId} />

      <Menu
        trigger={
          <div className="relative h-7 w-7 overflow-hidden rounded-full">
            <Avatar value={address} avatarUrl={profile?.avatarUrl} size={28} />
          </div>
        }
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-[165px]"
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

const shake = [7, -8.4, 6.3, -10, 8.4, -4.4, 0];

const variants = {
  shake: {
    x: shake,
    transition: {
      duration: 0.15,
      type: 'spring',
      bounce: 0,
    },
  },
};

const MotionPopoverContent = motion(Popover.Content);

function ModeToggle({ spaceId }: Props) {
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const { setEditable, editable } = useEditable();
  const controls = useAnimation();
  const canUserEdit = isEditor || isAdmin || isEditorController;
  const isUserEditing = isEditor && editable;
  const [attemptCount, setAttemptCount] = React.useState(0);
  const [showEditAccessTooltip, setShowEditAccessTooltip] = React.useState(false);

  // If a user doesn't have edit access on the page, make sure we set the toggle
  // state to false. This can happen if a user is in edit mode in a space they
  // have edit access in, then they navigate to a space they don't have edit
  // access in.
  if (!isEditor && !isAdmin && !isEditorController) setEditable(false);

  const onToggle = React.useCallback(() => {
    // If they are signed in and not an editor, shake the toggle to indicate that they can't edit,
    // otherwise toggle the edit mode. Only handle shaking and attempt logic in the context of a space.
    if (!canUserEdit && spaceId) {
      controls.start('shake');

      // Allow the user two attempts to toggle edit mode before showing the tooltip.
      if (attemptCount > 0) {
        setShowEditAccessTooltip(true);
        setAttemptCount(0);
      } else setAttemptCount(attemptCount => attemptCount + 1);
    } else setEditable(!editable);
  }, [canUserEdit, controls, editable, setEditable, attemptCount, spaceId]);

  const memoizedShortcuts = React.useMemo(
    () => [
      // Toggle edit mode when ⌘ + e is pressed
      {
        key: 'e',
        callback: onToggle,
      },
    ],
    [onToggle]
  );

  useKeyboardShortcuts(memoizedShortcuts);

  return (
    <button onClick={onToggle} className="flex w-[66px] items-center justify-between rounded-[47px] bg-divider p-1">
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {!isUserEditing && <AnimatedTogglePill controls={controls} />}
        <motion.div
          animate={controls}
          variants={variants}
          className={`z-10 transition-colors duration-300 ${!isUserEditing ? 'text-text' : 'text-grey-03'}`}
        >
          <EyeSmall />
        </motion.div>
      </div>
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {isUserEditing && <AnimatedTogglePill controls={controls} />}
        <Popover.Root open={showEditAccessTooltip} onOpenChange={setShowEditAccessTooltip}>
          {/* 
            Set an empty trigger so the Popover has a place to render itself. Without the trigger the popoover
            won't render even though we're controlling it imperatively.
        */}
          <Popover.Trigger />
          <Popover.Anchor asChild>
            <div
              className={`z-10 transition-colors duration-300 ${
                showEditAccessTooltip ? 'text-red-01' : isUserEditing ? 'text-text' : 'text-grey-03'
              }`}
            >
              <BulkEdit />
            </div>
          </Popover.Anchor>

          <Popover.Portal>
            <AnimatePresence mode="popLayout">
              {showEditAccessTooltip && (
                <MotionPopoverContent
                  className="z-10 origin-top-right rounded bg-text text-white px-3 py-2 shadow-button focus:outline-none w-[160px]"
                  side="bottom"
                  align="end"
                  alignOffset={-8}
                  sideOffset={16}
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{
                    type: 'spring',
                    duration: 0.15,
                    bounce: 0,
                  }}
                >
                  <h1 className="mb-1 text-button">You don’t have edit access in this space</h1>
                  <Popover.Arrow />
                </MotionPopoverContent>
              )}
            </AnimatePresence>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </button>
  );
}

function AnimatedTogglePill({ controls }: { controls: AnimationControls }) {
  return (
    <motion.div
      animate={controls}
      variants={variants}
      transition={{
        duration: 0.15,
        type: 'spring',
        bounce: 0,
      }}
      layoutId="edit-toggle"
      className="absolute h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
    />
  );
}
