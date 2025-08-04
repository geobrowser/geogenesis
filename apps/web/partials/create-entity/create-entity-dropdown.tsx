'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { usePathname, useRouter } from 'next/navigation';

import { useState } from 'react';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';

import { CreateSpaceDialog } from '../create-space/create-space-dialog';

export function CreateEntityDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { shouldShowElement } = useOnboardGuard();

  if (!shouldShowElement) {
    return null;
  }

  const spaceId = pathname?.startsWith('/space/') ? pathname.split('/space/')[1].split('/')[0] : null;

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      trigger={
        <button className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider">
          <Create />
        </button>
      }
      className="max-w-[120px] bg-white"
    >
      <MenuItem>
        <p className="text-center text-button">
          <CreateSpaceDialog />
        </p>
      </MenuItem>
      {spaceId && (
        <>
          <MenuItem
            onClick={() => {
              const entityId = ID.createEntityId();
              router.push(NavUtils.toEntity(spaceId, entityId));
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
        </>
      )}
    </Menu>
  );
}