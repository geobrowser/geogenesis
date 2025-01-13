'use client';

import * as React from 'react';

import { Menu, MenuItem } from '~/design-system/menu';

interface Props {
  trigger: React.ReactNode;
  manageMembersComponent: React.ReactNode;
}

export function SpaceMembersMenu(props: Props) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu open={isOpen} onOpenChange={setIsOpen} trigger={props.trigger} className="max-w-40 bg-white" sideOffset={16}>
      <MenuItem>{props.manageMembersComponent}</MenuItem>
      {/* <MenuItem>
        <p>Leave as member</p>
      </MenuItem> */}
    </Menu>
  );
}
