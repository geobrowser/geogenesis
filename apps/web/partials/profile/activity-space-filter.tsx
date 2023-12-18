'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { ALL_SPACES_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';

interface Props {
  spaceId: string;
  entityId: string;
}

export function ActivitySpaceFilter({ entityId, spaceId }: Props) {
  const { spaces } = useSpaces();
  const params = useSearchParams();
  const selectedSpaceId = params?.get('spaceId');

  const initialSpace = spaces.find(space => space.id === selectedSpaceId);
  const initialName = initialSpace?.spaceConfig?.name;

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
      spaceConfig: {
        name: 'All',
        image: ALL_SPACES_IMAGE,
      },
    },
    ...spaces,
  ];

  const onSelect = (spaceIdToFilter: string) => {
    onOpenChange(false);
    setName(spacesWithAll.find(space => space.id === spaceIdToFilter)?.spaceConfig?.name ?? 'All');
  };

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      asChild
      trigger={
        <SmallButton variant="secondary" icon={<ChevronDownSmall />}>
          {name}
        </SmallButton>
      }
      className="flex max-h-[300px] max-w-[250px] flex-col overflow-y-auto"
    >
      {spacesWithAll.map(space => (
        <Link
          href={NavUtils.toProfileActivity(spaceId, entityId, space.id === 'all' ? undefined : space.id)}
          onClick={() => onSelect(space.id)}
          key={space.id}
          className="flex w-full gap-2 bg-white p-3 text-button text-grey-04 transition-colors duration-75 hover:bg-bg hover:text-text"
        >
          {space.spaceConfig?.image && (
            <div className="relative mt-[4.5px] h-3 w-3 overflow-hidden rounded-xs">
              <Image src={getImagePath(space.spaceConfig.image)} layout="fill" objectFit="cover" />
            </div>
          )}
          {space.spaceConfig?.name}
        </Link>
      ))}
    </Menu>
  );
}
