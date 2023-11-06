'use client';

import { usePathname } from 'next/navigation';

import * as React from 'react';

import { TabLink } from '~/design-system/tab-link';

interface Props {
  spaceId: string;
}

export const SpaceNavbar = ({ spaceId }: Props) => {
  const path = usePathname();

  const tabEntitiesSelected = !path?.includes('/triples');
  const tabTriplesSelected = path?.includes('/triples');

  const tabs = [
    {
      name: 'Entities',
      href: `/space/${spaceId}/entities`,
      selected: Boolean(tabEntitiesSelected),
    },
    {
      name: 'Triples',
      href: `/space/${spaceId}/triples`,
      selected: Boolean(tabTriplesSelected),
    },
  ];

  return (
    <div className="flex h-9 w-full items-center justify-between">
      <div className="flex items-center gap-4">
        {tabs.map(tab => (
          <TabLink key={tab.name} href={tab.href} isActive={tab.selected}>
            {tab.name}
          </TabLink>
        ))}
      </div>
    </div>
  );
};
