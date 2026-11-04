'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';
import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { sortSpaceListByRankNameId } from '~/core/utils/space/browse-space-list-sort';
import { NavUtils, hasName } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Input } from '~/design-system/input';

import { moveEntity } from '~/partials/versions/move-entity';

type MoveEntityToSpaceProps = {
  entityId: EntityId;
  entityName?: string;
  sourceSpaceId: string;
  setIsMovingEntity: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
};

export const MoveEntityToSpace = ({
  entityId,
  entityName,
  sourceSpaceId,
  setIsMovingEntity,
  onDone,
}: MoveEntityToSpaceProps) => {
  const router = useRouter();
  const { storage } = useMutate();
  const { store, stream } = useSyncEngine();
  const cache = useQueryClient();

  const { personalSpaceId } = usePersonalSpaceId();
  const { space: personalSpace } = useSpace(personalSpaceId ?? undefined);
  const memberSpaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  const [query, setQuery] = useState<string>('');

  const movingRef = useRef(false);
  const [movingToSpaceId, setMovingToSpaceId] = useState<string | null>(null);

  const allSpaces = React.useMemo(() => {
    const others = memberSpaces.filter(s => s.id !== personalSpace?.id && s.id !== sourceSpaceId);
    const sortKeyed = others.map(s => ({
      id: s.id,
      name: s?.entity?.name ?? '',
      unnamed: !hasName(s?.entity?.name),
      space: s,
    }));
    const sorted = sortSpaceListByRankNameId(sortKeyed).map(entry => entry.space);
    return personalSpace && personalSpace.id !== sourceSpaceId ? [personalSpace, ...sorted] : sorted;
  }, [personalSpace, memberSpaces, sourceSpaceId]);

  const namedSpaces = allSpaces.filter(space => hasName(space?.entity?.name));

  const renderedSpaces =
    query.length === 0
      ? namedSpaces
      : namedSpaces.filter(space => space?.entity?.name?.toLowerCase()?.includes(query.toLowerCase()));

  const selectSpace = async (targetSpaceId: string) => {
    if (movingRef.current) return;
    movingRef.current = true;
    setMovingToSpaceId(targetSpaceId);

    let moved = false;
    try {
      moved = await moveEntity({ entityId, sourceSpaceId, targetSpaceId, storage, store, cache, stream });
    } finally {
      // A failed move can be tried again. A finished one stays locked: the menu closes behind it.
      if (!moved) {
        movingRef.current = false;
        setMovingToSpaceId(null);
      }
    }

    if (!moved) return;
    router.push(NavUtils.toEntity(targetSpaceId, entityId, true, entityName));
    onDone?.();
  };

  const isMoving = movingToSpaceId !== null;

  return (
    <div className="bg-white">
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsMovingEntity(false)} disabled={isMoving}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-4 p-2 text-center text-button whitespace-nowrap text-text">Select space to move to</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="flex max-h-[190px] flex-col gap-1 overflow-auto p-1">
        {renderedSpaces.map(space => (
          <MoveSpaceItem
            key={space.id}
            space={space}
            disabled={isMoving}
            isMovingHere={movingToSpaceId === space.id}
            onSelect={() => selectSpace(space.id)}
          />
        ))}
      </div>
    </div>
  );
};

type MoveSpaceItemProps = {
  space: ReturnType<typeof useSpacesWhereMember>[number];
  disabled: boolean;
  isMovingHere: boolean;
  onSelect: () => void;
};

const MoveSpaceItem = ({ space, disabled, isMovingHere, onSelect }: MoveSpaceItemProps) => {
  return (
    <button
      onClick={() => {
        onSelect();
      }}
      disabled={disabled}
      aria-busy={isMovingHere || undefined}
      className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <div className="relative size-4 rounded bg-grey-01">
        <GeoImage value={space.entity.image} fill style={{ objectFit: 'cover' }} alt="" />
      </div>
      <div className="text-button text-text">{space.entity.name}</div>
      {isMovingHere && <div className="text-button text-grey-04">Moving…</div>}
    </button>
  );
};
