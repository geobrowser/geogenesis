'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { revalidatePath } from 'next/cache';
import Image from 'next/legacy/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { ALL_SPACES_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
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
        [SYSTEM_IDS.IMAGE_ATTRIBUTE]: ALL_SPACES_IMAGE,
      },
    },
    ...spaces,
  ];

  const onSelect = (spaceIdToFilter: string) => {
    onOpenChange(false);
    setName(spacesWithAll.find(space => space.id === spaceIdToFilter)?.attributes[SYSTEM_IDS.NAME] ?? 'All');
  };

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
      {spacesWithAll.map(space => (
        <Link
          href={NavUtils.toProfileActivity(spaceId, entityId, space.id === 'all' ? undefined : space.id)}
          onClick={() => onSelect(space.id)}
          key={space.id}
          className="text-button p-3 bg-white text-grey-04 hover:text-text hover:bg-bg transition-colors duration-75 flex gap-2 w-full"
        >
          {space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] && (
            <div className="relative w-3 h-3 rounded-xs overflow-hidden mt-[4.5px]">
              <Image src={getImagePath(space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])} layout="fill" objectFit="cover" />
            </div>
          )}
          {space.attributes[SYSTEM_IDS.NAME]}
        </Link>
      ))}
    </Menu>
  );
}
