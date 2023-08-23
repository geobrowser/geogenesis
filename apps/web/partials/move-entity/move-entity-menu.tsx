'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { e } from 'vitest/dist/global-fe52f84b';

import * as React from 'react';

import { ALL_SPACES_IMAGE } from '~/core/constants';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Space } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton, SquareButton } from '~/design-system/button';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import Spaces from '~/app/spaces/page';

interface Props {
  spaceId: string;
  entityId: string;
}

export function MoveEntityMenu({ entityId, spaceId }: Props) {
  const { spaces } = useSpaces();

  const params = useSearchParams();
  const selectedSpaceId = params?.get('spaceId');
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [searchQuery, setSearchQueryChange] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 100);

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

  // filter out the current space and Root space
  const spacesForMove = spaces.filter(space => space.id !== spaceId && space.isRootSpace !== true);

  // check if the spaces name is not undefined and then sort alphabetically:
  const sortedSpacesForMove = spacesForMove.sort((spaceA: Space, spaceB: Space) => {
    const nameA = spaceA.attributes[SYSTEM_IDS.NAME];
    const nameB = spaceB.attributes[SYSTEM_IDS.NAME];

    if (nameA !== undefined && nameB !== undefined) {
      return nameA > nameB ? 1 : -1;
    }
    return 0;
  });

  // @TODO: Make search work with autocomplete and actually filter the results

  const filteredSpacesForMoveResults = sortedSpacesForMove.filter(space => {
    space.attributes[SYSTEM_IDS.NAME]?.toLowerCase().startsWith(debouncedSearchQuery.toLowerCase());
  });

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="cog" />}>
      <div className="flex flex-col gap-2 bg-white p-2">
        <Text variant="smallButton">Move to space</Text>
        <SpaceSearch />
        <SpacesList spaces={sortedSpacesForMove} />
      </div>
    </Menu>
  );
}

function SpaceSearch() {
  return (
    <div className="mb-2">
      <Input onChange={e => console.log(e.target.value)} placeholder="Search for a space" />
    </div>
  );
}

function SpacesList({ spaces }: { spaces: Space[] }) {
  return (
    <div className="flex flex-col max-h-[300px]  overflow-y-auto justify-between w-full">
      {spaces.map(space => (
        <div
          key={space.id}
          className="flex flex-row items-center gap-3 py-2 hover:bg-grey-01 hover:bg-opacity-10 transition-colors duration-75 cursor-pointer"
          onClick={() => console.log('selected space id', space.id)}
        >
          {space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] && (
            <div className="relative w-[32px] h-[32px] rounded-xs overflow-hidden">
              <Image src={getImagePath(space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])} layout="fill" objectFit="cover" />
            </div>
          )}
          <Text variant="metadataMedium">{space.attributes[SYSTEM_IDS.NAME]}</Text>
        </div>
      ))}
    </div>
  );
}
