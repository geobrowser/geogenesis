'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Menu } from '~/design-system/menu';

interface Props {
  spaceId?: string;
  entityId: string;
}

export function ActivitySpaceMenu({ entityId, spaceId }: Props) {
  const { spaces } = useSpaces();

  const initialSpace = spaces.find(space => space.id === spaceId);
  const initialName = initialSpace?.attributes[SYSTEM_IDS.NAME];

  const router = useRouter();
  const [open, onOpenChange] = React.useState(false);
  const [name, setName] = React.useState('All');

  React.useEffect(() => {
    if (initialName) {
      setName(initialName);
    }
  }, [initialName]);

  const spacesWithAll = [
    {
      id: 'all',
      attributes: {
        name: 'All',
      },
    },
    ...spaces,
  ];

  const onSelect = (spaceIdToFilter: string) => {
    onOpenChange(false);
    setName(spacesWithAll.find(space => space.id === spaceIdToFilter)?.attributes[SYSTEM_IDS.NAME] ?? 'All');
    router.push(
      NavUtils.toProfileActivity(spaceIdToFilter, entityId, spaceIdToFilter === 'all' ? undefined : spaceIdToFilter)
    );
  };

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      trigger={
        <SmallButton variant="secondary" icon="chevronDownSmall">
          {name}
        </SmallButton>
      }
      className="flex flex-col max-h-[300px] max-w-[260px] overflow-y-auto bg-white"
    >
      {spacesWithAll.map(space => (
        <button onClick={() => onSelect(space.id)} key={space.id} className="text-button px-2 py-3">
          {space.attributes[SYSTEM_IDS.NAME]}
        </button>
      ))}
    </Menu>
  );
}
