'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { cva } from 'class-variance-authority';
import { AnimatePresence, AnimationControls, motion, useAnimation } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { Cookie } from '~/core/cookie';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { usePerson } from '~/core/hooks/use-person';
import { fetchProfile } from '~/core/io/subgraph';
import { useEditable } from '~/core/state/editable-store';
import { Profile } from '~/core/types';
import { NavUtils, formatShortAddress } from '~/core/utils/utils';
import { GeoConnectButton } from '~/core/wallet';

import { Avatar } from '~/design-system/avatar';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { Check } from '~/design-system/icons/check';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { Menu } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';

import { useCreateProfile } from '../onboarding/create-profile-dialog';

interface MenuState {
  isOpen: boolean;
  // Profile switcher is a submenu within the menu
  isProfileSwitcherOpen: boolean;
}

type MenuAction =
  | {
      type: 'SET_OPEN';
      open: boolean;
    }
  | {
      type: 'SET_PROFILE_SWITCHER_OPEN';
      open: boolean;
    };

function menuReducer(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'SET_OPEN':
      return {
        ...state,
        isOpen: action.open,
        // Close the profile switcher if we're closing the menu
        isProfileSwitcherOpen: action.open ? state.isProfileSwitcherOpen : false,
      };
    case 'SET_PROFILE_SWITCHER_OPEN':
      return {
        ...state,
        isProfileSwitcherOpen: action.open,
      };
  }
}

export function NavbarActions() {
  const [menuState, dispatch] = React.useReducer(menuReducer, {
    isOpen: false,
    isProfileSwitcherOpen: false,
  });

  const { showCreateProfile } = useCreateProfile();

  const { user } = usePrivy();
  const { address } = useAccount();
  const { profile, isLoading: isProfileLoading } = useGeoProfile(address as `0x${string}` | undefined);
  const { person, isLoading: isPersonLoading } = usePerson(address);

  if (!user?.wallet?.address) {
    return <GeoConnectButton />;
  }

  if (isProfileLoading || isPersonLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-7 w-[66px]" radius="rounded-full" />
        <Skeleton className="h-7 w-7" radius="rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ModeToggle />

      <Menu
        trigger={
          <div className="relative h-7 w-7 overflow-hidden rounded-full">
            <Avatar value={address} avatarUrl={person?.avatarUrl} size={28} />
          </div>
        }
        open={menuState.isOpen}
        onOpenChange={open => dispatch({ type: 'SET_OPEN', open })}
        className="max-w-[300px]"
      >
        {!menuState.isProfileSwitcherOpen ? (
          <>
            <AvatarMenuItemsContainer>
              <AvatarMenuItem isCurrentlySelected>
                <button
                  onClick={() => dispatch({ type: 'SET_PROFILE_SWITCHER_OPEN', open: true })}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex w-full items-center gap-3">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full">
                      <Avatar value={profile?.account ?? address} avatarUrl={person?.avatarUrl} size={32} />
                    </div>
                    <div>
                      <p className="text-text">{person?.name ?? formatShortAddress(user.wallet.address)}</p>
                      {user.email ? (
                        <p className="text-sm text-grey-04">{user.email.address}</p>
                      ) : (
                        <p className="text-sm text-grey-04">{formatShortAddress(address ?? user.wallet.address)}</p>
                      )}
                    </div>
                  </div>
                  <RightArrowLong color="grey-04" />
                </button>
              </AvatarMenuItem>
              {!person && profile ? (
                <AvatarMenuItem>
                  <div className="flex items-center gap-2">
                    <div className="relative h-4 w-4 overflow-hidden rounded-full">
                      <Avatar value={profile?.account} size={16} />
                    </div>
                    <button onClick={showCreateProfile}>Create profile</button>
                  </div>
                </AvatarMenuItem>
              ) : (
                <>
                  {profile?.homeSpace && (
                    <>
                      <AvatarMenuItem>
                        <Link
                          prefetch={false}
                          onClick={() => dispatch({ type: 'SET_OPEN', open: false })}
                          href={NavUtils.toSpace(profile.homeSpace)}
                          className="w-full text-button"
                        >
                          Personal space
                        </Link>
                      </AvatarMenuItem>
                      <AvatarMenuItem>
                        <Link
                          href="/home"
                          className="w-full text-button"
                          onClick={() => dispatch({ type: 'SET_OPEN', open: false })}
                        >
                          Home
                        </Link>
                      </AvatarMenuItem>
                    </>
                  )}
                </>
              )}
            </AvatarMenuItemsContainer>

            <div className="flex w-full select-none items-center justify-between bg-white px-4 py-2 text-button text-text hover:bg-divider">
              <GeoConnectButton />
            </div>
          </>
        ) : (
          <>
            <button
              className="flex w-full items-center gap-2 p-2 text-smallButton text-grey-04"
              onClick={() => dispatch({ type: 'SET_PROFILE_SWITCHER_OPEN', open: false })}
            >
              <LeftArrowLong color="grey-04" />
              <p>Back</p>
            </button>

            <AvatarMenuItemsContainer>
              <WalletsList onSelect={() => dispatch({ type: 'SET_PROFILE_SWITCHER_OPEN', open: false })} />
            </AvatarMenuItemsContainer>
          </>
        )}
      </Menu>
    </div>
  );
}

const avatarMenuItemStyles = cva(
  'flex w-full select-none items-center justify-between rounded-md px-3 py-2 text-button text-text hover:bg-divider hover:outline-none',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-03',
        false: 'cursor-pointer text-grey-04 hover:bg-bg hover:text-text',
      },
      isCurrentlySelected: {
        true: 'bg-grey-01',
        false: 'bg-white',
      },
    },
    defaultVariants: {
      disabled: false,
    },
  }
);

function AvatarMenuItemsContainer({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 p-1">{children}</div>;
}

function AvatarMenuItem({
  children,
  isCurrentlySelected,
  disabled = false,
}: {
  children: React.ReactNode;
  isCurrentlySelected?: boolean;
  disabled?: boolean;
}) {
  return <div className={avatarMenuItemStyles({ disabled, isCurrentlySelected })}>{children}</div>;
}

function WalletsList({ onSelect }: { onSelect: () => void }) {
  const { address } = useAccount();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  const addresses = wallets.map(w => w.address);
  const { data: persons, isLoading } = useQuery({
    queryKey: ['persons', addresses],
    queryFn: async () => {
      const maybePersons = await Promise.all(addresses.map(address => fetchProfile({ address })));

      const personsByAddress = new Map<string, Profile | null>();

      for (const [index, person] of maybePersons.entries()) {
        if (person) personsByAddress.set(person[1].address, person[1]);
        else personsByAddress.set(addresses[index], null);
      }

      return personsByAddress;
    },
  });

  if (isLoading || !persons) {
    return (
      <AvatarMenuItem>
        <Skeleton className="h-8 w-8" radius="rounded-full" />
      </AvatarMenuItem>
    );
  }

  return wallets.map(w => {
    const maybePerson = persons.get(w.address);
    const maybeUserEmail = user?.wallet?.address === w.address ? user?.email?.address : null;
    const isCurrentWallet = address === w.address;
    const displayName = maybePerson?.name ?? maybeUserEmail ?? formatShortAddress(w.address);

    return (
      <AvatarMenuItem key={`${w.address}-${w.connectorType}`} isCurrentlySelected={isCurrentWallet}>
        <button
          onClick={() => {
            onSelect();

            Cookie.onConnectionChange({ type: 'connect', address: w.address as `0x${string}` });
            setActiveWallet(w);
          }}
          className="flex w-full items-center justify-between"
        >
          <div className="flex w-full items-center gap-3">
            <div className="relative h-8 w-8 overflow-hidden rounded-full">
              <Avatar value={w.address} avatarUrl={maybePerson?.avatarUrl} size={32} />
            </div>
            <p className="text-button">{displayName}</p>
          </div>
          {isCurrentWallet && <Check />}
        </button>
      </AvatarMenuItem>
    );
  });
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
  const params = useParams();
  const spaceId = params?.['id'] as string | undefined;

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
    <button
      onClick={onToggle}
      data-testid="edit-toggle"
      className="flex w-[66px] items-center justify-between rounded-[47px] bg-divider p-1"
    >
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
        duration: 0.15,
        type: 'spring',
        bounce: 0,
      }}
      layoutId="edit-toggle"
      className="absolute h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
    />
  );
}
