'use client';

import Image from 'next/legacy/image';

import * as React from 'react';

import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useMoveEntity } from '~/core/state/move-entity-store';
import { Space } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

interface Props {
  spaceId: string;
  entityId: string;
}

export function MoveEntityMenu({ entityId, spaceId }: Props) {
  const { spaces } = useSpaces();

  const [query, onQueryChange] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, 100);
  const { setIsMoveReviewOpen, setSpaceIdTo, setSpaceIdFrom, setEntityId } = useMoveEntity();

  // filter out the current space, Root space, and ones user is not an editor in
  const spacesForMove = spaces.filter(space => space.id !== spaceId && space.isRootSpace !== true);

  // check if the spaces name is not undefined and then sort alphabetically:
  const sortedSpacesForMove = spacesForMove.sort((spaceA: Space, spaceB: Space) => {
    const nameA = spaceA.spaceConfig?.name ?? spaceA.id;
    const nameB = spaceB.spaceConfig?.name ?? spaceB.id;

    if (nameA !== undefined && nameB !== undefined) {
      return nameA > nameB ? 1 : -1;
    }
    return 0;
  });

  const filteredSpacesForMoveResults = sortedSpacesForMove.filter(
    space => space.spaceConfig?.name?.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 bg-white">
      <div className="flex flex-col gap-2 px-2 pt-2">
        <Text variant="smallButton">Move to space</Text>
        <Input onChange={e => onQueryChange(e.target.value)} placeholder="Search for a Space by name" />
      </div>

      <div className="flex max-h-[300px] w-full flex-col justify-between overflow-y-auto">
        {filteredSpacesForMoveResults.map(space => (
          <button
            key={space.id}
            className="flex cursor-pointer items-center gap-3 p-2 transition-colors duration-75 hover:bg-grey-01 focus:bg-grey-01"
            onClick={() => {
              setSpaceIdFrom(spaceId);
              setSpaceIdTo(space.id);
              setEntityId(entityId);
              setIsMoveReviewOpen(true);
            }}
          >
            {space.spaceConfig?.image && (
              <div className="relative h-8 w-8 overflow-hidden rounded">
                <Image src={getImagePath(space.spaceConfig.image)} layout="fill" objectFit="cover" />
              </div>
            )}
            <Text variant="metadataMedium">{space.spaceConfig?.name ?? space.id}</Text>
          </button>
        ))}
      </div>

      {filteredSpacesForMoveResults.length === 0 && (
        <div className="flex flex-col gap-1 p-2 pt-0">
          <Text variant="footnoteMedium">No spaces found for your search results.</Text>
        </div>
      )}
    </div>
  );
}
