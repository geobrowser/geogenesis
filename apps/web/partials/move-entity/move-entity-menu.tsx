'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useAccount, useWalletClient } from 'wagmi';

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

  // filter out the current space and Root space
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

  // @TODO: Make search work with autocomplete

  const filteredSpacesForMoveResults = sortedSpacesForMove.filter(space =>
    space.attributes[SYSTEM_IDS.NAME]?.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 bg-white p-2">
      <Text variant="smallButton">Move to space</Text>
      <SpaceSearch onQueryChange={onQueryChange} />
      <SpacesList
        spaces={filteredSpacesForMoveResults}
        spaceId={spaceId}
        entityId={entityId}
        debouncedQuery={debouncedQuery}
        setIsMoveReviewOpen={setIsMoveReviewOpen}
        setEntityId={setEntityId}
        setSpaceIdFrom={setSpaceIdFrom}
        setSpaceIdTo={setSpaceIdTo}
      />
    </div>
  );
}

function SpaceSearch({ onQueryChange }: { onQueryChange: (query: string) => void }) {
  return (
    <div className="mb-2">
      <Input onChange={e => onQueryChange(e.target.value)} placeholder="Search for a Space by name" />
    </div>
  );
}

function SpacesList({
  spaces,
  debouncedQuery,
  spaceId,
  entityId,
  setIsMoveReviewOpen,
  setSpaceIdFrom,
  setSpaceIdTo,
  setEntityId,
}: {
  spaces: Space[];
  debouncedQuery: string;
  spaceId: string;
  entityId: string;
  setIsMoveReviewOpen: (isMoveReviewOpen: boolean) => void;
  setEntityId: (value: string) => void;
  setSpaceIdTo: (value: string) => void;
  setSpaceIdFrom: (value: string) => void;
}) {
  return (
    <div className="flex flex-col max-h-[300px]  overflow-y-auto justify-between w-full">
      {spaces.map(space => (
        <div
          key={space.id}
          className="flex flex-row items-center gap-3 my-2  hover:bg-grey-01 transition-colors duration-75 cursor-pointer "
          onClick={() => {
            setSpaceIdFrom(spaceId);
            setSpaceIdTo(space.id);
            setEntityId(entityId);
            setIsMoveReviewOpen(true);
          }}
        >
          {space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] && (
            <div className="relative w-[32px] h-[32px] rounded-xs overflow-hidden">
              <Image src={getImagePath(space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])} layout="fill" objectFit="cover" />
            </div>
          )}
          <Text variant="metadataMedium">{space.attributes[SYSTEM_IDS.NAME]}</Text>
        </div>
      ))}
      {spaces.length === 0 && (
        <div className="flex flex-col gap-1">
          <Text variant="footnoteMedium">You don’t have editor access in any other spaces.</Text>
          <Text variant="footnote">
            You will need to become an editor of the space you want to move the entities to.
          </Text>
        </div>
      )}
    </div>
  );
}
