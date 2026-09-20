'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpaceId } from '~/core/hooks/use-space-id';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';

import { useOpenCreateSpaceDialog } from '../create-space/create-space-dialog';

export function CreateEntityDropdown() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const openCreateSpaceDialog = useOpenCreateSpaceDialog();

  const spaceId = useSpaceId();
  const { smartAccount } = useSmartAccount();

  if (!smartAccount?.account.address) {
    return null;
  }

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      asChild
      trigger={
        <button
          aria-label="Create"
          className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider"
        >
          <Create />
        </button>
      }
      className="max-w-[120px] bg-white"
    >
      <MenuItem onClick={() => openCreateSpaceDialog()}>
        <p className="text-center text-button">New space</p>
      </MenuItem>
      {spaceId && (
        <>
          <MenuItem
            onClick={() => {
              router.push(NavUtils.toEntity(spaceId, ID.createEntityId(), true));
            }}
          >
            <p className="text-center text-button">New entity</p>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const entityId = ID.createEntityId();
              // Navigate to new entity page with property type preset
              router.push(`${NavUtils.toEntity(spaceId, entityId)}?edit=true&type=property`);
            }}
          >
            <p className="text-center text-button">New property</p>
          </MenuItem>
          {/* Temporarily hidden while the import data feature is being improved.
          {(isEditor || isMember) && (
            <MenuItem
              onClick={() => {
                router.push(NavUtils.toImport(spaceId));
              }}
            >
              <p className="text-center text-button">Import data</p>
            </MenuItem>
          )} */}
        </>
      )}
    </Menu>
  );
}
