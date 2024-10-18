'use client';

import { usePathname, useRouter } from 'next/navigation';

import { useState } from 'react';

import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';

import { CreateSpaceDialog } from './create-space-dialog';

export function CreateSpaceDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      trigger={
        <button className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider sm:hidden">
          <Create />
        </button>
      }
      className="max-w-[98px] bg-white"
    >
      <MenuItem>
        <p className="text-center text-button">
          <CreateSpaceDialog />
        </p>
      </MenuItem>
      {pathname?.startsWith('/space/') && (
        <MenuItem
          onClick={() => {
            const spaceId = pathname.split('/space/')[1].split('/')[0];
            const entityId = ID.createEntityId();
            router.push(NavUtils.toEntity(spaceId, entityId));
          }}
        >
          <p className="text-center text-button">New entity</p>
        </MenuItem>
      )}
    </Menu>
  );
}
