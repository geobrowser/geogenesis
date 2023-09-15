'use client';

import * as React from 'react';

import { Menu, MenuItem } from '~/design-system/menu';

interface Props {
  trigger: React.ReactNode;
}

export function SpaceEditorsMenu(props: Props) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu open={isOpen} onOpenChange={setIsOpen} trigger={props.trigger} className="max-w-[160px] bg-white">
      <MenuItem>
        <p className="px-3 py-2">Manage editors</p>
      </MenuItem>
      <MenuItem>
        <p className="px-3 py-2">Leave as editor</p>
      </MenuItem>
    </Menu>
  );
}
