'use client';

import { useState } from 'react';

import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';

import { CreateSpaceDialog } from './create-space-dialog';

export function CreateSpaceDropdown() {
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
    </Menu>
  );
}
