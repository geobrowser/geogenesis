'use client';

import * as React from 'react';

import { Menu, MenuItem } from '~/design-system/menu';

interface Props {
  trigger: React.ReactNode;
  manageMembersComponent: React.ReactNode;
}

export function SpaceEditorsMenu(props: Props) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={props.trigger}
      className="max-w-[160px] bg-white"
      sideOffset={16}
    >
      <MenuItem>{props.manageMembersComponent}</MenuItem>
      <MenuItem>
        <p className="px-3 py-2">Leave as editor</p>
      </MenuItem>
    </Menu>
  );
}
