'use client';

import { useState } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpaceId } from '~/core/hooks/use-space-id';

import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';

import { useCreateEntityActions } from './use-create-entity-actions';

export function CreateEntityDropdown() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const spaceId = useSpaceId();
  const { canCreateInSpace, createEntity, createProperty, createSpace } = useCreateEntityActions(spaceId);
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
      <MenuItem onClick={createSpace}>
        <p className="text-center text-button">New space</p>
      </MenuItem>
      {canCreateInSpace && (
        <>
          <MenuItem onClick={createEntity}>
            <p className="text-center text-button">New entity</p>
          </MenuItem>
          <MenuItem onClick={createProperty}>
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
