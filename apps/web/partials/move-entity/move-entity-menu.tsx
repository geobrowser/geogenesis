'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useAccount } from 'wagmi';

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
  const { address } = useAccount();

  // filter out the current space, Root space, and ones user is not an editor in
  const spacesForMove = spaces.filter(
    space => space.id !== spaceId && space.isRootSpace !== true && space.editors.includes(address ?? '')
  );

  // check if the spaces name is not undefined and then sort alphabetically:
  const sortedSpacesForMove = spacesForMove.sort((spaceA: Space, spaceB: Space) => {
    const nameA = spaceA.attributes[SYSTEM_IDS.NAME];
    const nameB = spaceB.attributes[SYSTEM_IDS.NAME];

    if (nameA !== undefined && nameB !== undefined) {
      return nameA > nameB ? 1 : -1;
    }
    return 0;
  });

  const filteredSpacesForMoveResults = sortedSpacesForMove.filter(space =>
    space.attributes[SYSTEM_IDS.NAME]?.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 bg-white">
      <div className="flex flex-col gap-2 px-2 pt-2">
        <Text variant="smallButton">Move to space</Text>
        <Input onChange={e => onQueryChange(e.target.value)} placeholder="Search for a Space by name" />
      </div>

      <div className="flex flex-col max-h-[300px] overflow-y-auto justify-between w-full">
        {filteredSpacesForMoveResults.map(space => (
          <button
            key={space.id}
            className="flex items-center gap-3 p-2 hover:bg-grey-01 focus:bg-grey-01 transition-colors duration-75 cursor-pointer"
            onClick={() => {
              setSpaceIdFrom(spaceId);
              setSpaceIdTo(space.id);
              setEntityId(entityId);
              setIsMoveReviewOpen(true);
            }}
          >
            {space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] && (
              <div className="relative w-8 h-8 rounded overflow-hidden">
                <Image
                  src={getImagePath(space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])}
                  layout="fill"
                  objectFit="cover"
                />
              </div>
            )}
            <Text variant="metadataMedium">{space.attributes[SYSTEM_IDS.NAME]}</Text>
          </button>
        ))}
      </div>

      {filteredSpacesForMoveResults.length === 0 && (
        <div className="flex flex-col gap-1 p-2 pt-0">
          <Text variant="footnoteMedium">You don’t have editor access in any other spaces.</Text>
          <Text variant="footnote">
            You will need to become an editor of the space you want to move the entities to.
          </Text>
        </div>
      )}
    </div>
  );
}
