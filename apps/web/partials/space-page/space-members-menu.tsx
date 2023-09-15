'use client';

import * as React from 'react';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';

export function SpaceMembersMenu() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu open={isOpen} onOpenChange={setIsOpen} trigger={<ChevronDownSmall color="grey-04" />}>
      <MenuItem>Hello world</MenuItem>
    </Menu>
  );
}
