'use client';

import { useLogout } from '@privy-io/react-auth';
import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import { AnimatePresence, AnimationControls, motion, useAnimation } from 'framer-motion';
import { useSetAtom } from 'jotai';

import * as React from 'react';

import { Cookie } from '~/core/cookie';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpaceId } from '~/core/hooks/use-space-id';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditable } from '~/core/state/editable-store';
import { NavUtils } from '~/core/utils/utils';
import { GeoConnectButton } from '~/core/wallet';

import { Avatar } from '~/design-system/avatar';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { DisconnectWallet } from '~/design-system/icons/disconnect-wallet';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { Home } from '~/design-system/icons/home';
import { Menu } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { avatarAtom, entityIdAtom, nameAtom, spaceIdAtom, stepAtom } from '../onboarding/dialog';

function useUser() {
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile, isLoading: isLoadingProfile } = useGeoProfile(address);

  return { isLoading: isLoadingSmartAccount || isLoadingProfile, address, profile };
}

function useResetOnboarding() {
  const setName = useSetAtom(nameAtom);
  const setEntityId = useSetAtom(entityIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const resetOnboarding = () => {
    setName('');
    setEntityId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
  };

  return resetOnboarding;
}

export function NavbarActions() {
  const [open, onOpenChange] = React.useState(false);

  const { isLoading: isUserLoading, profile, address } = useUser();

  const { shouldShowElement } = useOnboardGuard();
  const resetOnboarding = useResetOnboarding();

  const { logout } = useLogout({
    onSuccess: async () => {
      console.log('disconnecting');
      await Cookie.onConnectionChange({ type: 'disconnect' });
      resetOnboarding();
    },
  });

  if (isUserLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-7 w-[66px]" radius="rounded-full" />
        <Skeleton className="h-7 w-7" radius="rounded-full" />
      </div>
    );
  }

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
        className="max-w-[165px]"
      >
        {profile?.profileLink && (
          <>
            <AvatarMenuItem>
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4 overflow-hidden rounded-full">
                  <Avatar value={address} avatarUrl={profile?.avatarUrl} size={16} />
                </div>
                <Link
                  prefetch={false}
                  href={NavUtils.toSpace(profile?.profileLink.split('/')[2])}
                  className="text-button"
                >
                  Personal space
                </Link>
              </div>
            </AvatarMenuItem>
          </>
        )}
        {shouldShowElement && (
          <AvatarMenuItem>
            <Link href="/home" className="flex items-center gap-2 grayscale">
              <Home />
              <p className="text-button">Personal home</p>
            </Link>
          </AvatarMenuItem>
        )}
        <AvatarMenuItem>
          <button
            onClick={logout}
            className="m-0 flex w-full cursor-pointer items-center justify-between border-none bg-transparent p-0"
          >
            <p className="text-button">Sign out</p>
            <DisconnectWallet />
          </button>
        </AvatarMenuItem>
      </Menu>
    </div>
  );
}

const avatarMenuItemStyles = cva(
  'flex w-full select-none items-center justify-between bg-white px-3 py-2 text-button hover:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-03',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-03',
        false: 'cursor-pointer text-grey-04 hover:bg-bg hover:text-text',
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

function ModeToggle() {
  const controls = useAnimation();
  const { editable, setEditable } = useEditable();

  const spaceId = useSpaceId();
  const canUserEdit = useCanUserEdit(spaceId ?? '');

  React.useEffect(() => {
    // If a user doesn't have edit access on the page, make sure we set the toggle
    // state to false. This can happen if a user is in edit mode in a space they
    // have edit access in, then they navigate to a space they don't have edit
    // access in.
    if (!canUserEdit) {
      setEditable(false);
    }
  }, [canUserEdit, setEditable]);

  const [attemptCount, setAttemptCount] = React.useState(0);
  const [showEditAccessTooltip, setShowEditAccessTooltip] = React.useState(false);

  const onToggle = React.useCallback(() => {
    if (!spaceId) {
      setEditable(false);
      return;
    }

    // If they are signed in and not an editor, shake the toggle to indicate that they can't edit,
    // otherwise toggle the edit mode. Only handle shaking and attempt logic in the context of a space.
    if (!canUserEdit) {
      if (editable) {
        // Make sure they can always escape edit mode
        setEditable(false);
        return;
      }

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

  if (!spaceId) {
    // Only show toggle on pages that are editable
    return null;
  }

  return (
    <button
      onClick={onToggle}
      data-testid="edit-toggle"
      className="flex w-[66px] items-center justify-between rounded-[47px] bg-divider p-1"
    >
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {!editable && <AnimatedTogglePill controls={controls} />}
        <motion.div
          animate={controls}
          variants={variants}
          className={`z-10 transition-colors duration-300 ${!editable ? 'text-text' : 'text-grey-03'}`}
        >
          <EyeSmall />
        </motion.div>
      </div>
      <div className="flex h-5 w-7 items-center justify-center rounded-[44px]">
        {editable && <AnimatedTogglePill controls={controls} />}
        <Popover.Root open={showEditAccessTooltip} onOpenChange={setShowEditAccessTooltip}>
          <Popover.Anchor asChild>
            <div
              className={`z-10 transition-colors duration-300 ${
                showEditAccessTooltip ? 'text-red-01' : editable ? 'text-text' : 'text-grey-03'
              }`}
            >
              <BulkEdit />
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <AnimatePresence mode="popLayout">
              {showEditAccessTooltip && (
                <MotionPopoverContent
                  className="z-10 max-w-[164px] origin-top-right rounded bg-text p-2 text-white shadow-button focus:outline-none"
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
                  <h1 className="text-center text-breadcrumb">You don’t have edit access in this space</h1>
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
        duration: 0.5,
        type: 'spring',
        bounce: 0,
      }}
      layoutId="edit-toggle"
      className="absolute h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
    />
  );
}
