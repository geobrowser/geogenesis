'use client';

import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

/* @TODO:
  - add the filter logic with the data fetching
  - add the menu filter options to the dropdown
  - style the dropdown
*/

export function PersonalHomeFilter() {
  const params = useSearchParams();

  const [open, onOpenChange] = React.useState(false);
  const [name, setName] = React.useState('All');

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      asChild
      trigger={
        <SmallButton variant="secondary" icon="chevronDownSmall">
          {name}
        </SmallButton>
      }
      className="flex flex-col max-h-[300px] max-w-[250px] overflow-y-auto"
    >
      <Text className="text-button p-3 bg-white text-grey-04 hover:text-text hover:bg-bg transition-colors duration-75 flex gap-2 w-full">
        Actionable
      </Text>
      <Text className="text-button p-3 bg-white text-grey-04 hover:text-text hover:bg-bg transition-colors duration-75 flex gap-2 w-full">
        Non-Actionable
      </Text>
    </Menu>
  );
}
