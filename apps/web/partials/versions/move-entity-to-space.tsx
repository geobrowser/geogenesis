'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';
import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { hasName } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Input } from '~/design-system/input';

import { cloneEntityIntoSpace } from '~/partials/versions/clone-entity-into-space';

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

  const { personalSpaceId } = usePersonalSpaceId();
  const { space: personalSpace } = useSpace(personalSpaceId ?? undefined);
  const memberSpaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  const [query, setQuery] = useState<string>('');

  const allSpaces = React.useMemo(() => {
    const spaces = [...memberSpaces];
    if (personalSpace && !spaces.some(s => s.id === personalSpace.id)) {
      spaces.unshift(personalSpace);
    }
    // Filter out the source space since we're moving away from it
    return spaces.filter(s => s.id !== sourceSpaceId);
  }, [personalSpace, memberSpaces, sourceSpaceId]);

  const namedSpaces = allSpaces.filter(space => hasName(space?.entity?.name));

  const renderedSpaces =
    query.length === 0
      ? namedSpaces
      : namedSpaces.filter(space => space?.entity?.name?.toLowerCase()?.includes(query.toLowerCase()));

  const moveEntityToSpace = (targetSpaceId: string) => {
    if (!targetSpaceId || targetSpaceId === sourceSpaceId) return;

    // 1. Clone entity into target space
    cloneEntityIntoSpace(entityId, sourceSpaceId, targetSpaceId, storage);

    // 2. Delete entity from source space
    const sourceValues = getValues({
      selector: value => value.entity.id === entityId && value.spaceId === sourceSpaceId,
    });

    const sourceRelations = getRelations({
      selector: relation => relation.fromEntity.id === entityId && relation.spaceId === sourceSpaceId,
    });

    const blocksRelations = sourceRelations.filter(r => r.type.id === SystemIds.BLOCKS);
    const blockIds = [...new Set(blocksRelations.map(r => r.toEntity.id))];

    const orphanedBlockIds = blockIds.filter(blockId => {
      const remainingRefs = getRelations({
        selector: r =>
          r.toEntity.id === blockId &&
          !(r.fromEntity.id === entityId && r.type.id === SystemIds.BLOCKS && r.spaceId === sourceSpaceId),
      });
      return remainingRefs.length === 0;
    });

    const allValuesToDelete = [...sourceValues];
    const relationIds = new Set<string>();
    const allRelationsToDelete: typeof sourceRelations = [];

    for (const r of [
      ...sourceRelations,
      ...getRelations({ selector: r => r.toEntity.id === entityId && r.spaceId === sourceSpaceId }),
    ]) {
      if (!relationIds.has(r.id)) {
        relationIds.add(r.id);
        allRelationsToDelete.push(r);
      }
    }

    for (const blockId of orphanedBlockIds) {
      allValuesToDelete.push(...getValues({ selector: v => v.entity.id === blockId }));
      for (const r of getRelations({
        selector: r => r.fromEntity.id === blockId || r.toEntity.id === blockId,
      })) {
        if (!relationIds.has(r.id)) {
          relationIds.add(r.id);
          allRelationsToDelete.push(r);
        }
      }
    }

    storage.values.deleteMany(allValuesToDelete);
    storage.relations.deleteMany(allRelationsToDelete);
  };

  return (
    <div className="bg-white">
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsMovingEntity(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-4 p-2 text-center text-button text-text">Select space to move to</div>
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
            onSelect={() => {
              moveEntityToSpace(space.id);
              router.push(NavUtils.toEntity(space.id, entityId, true, entityName));
              onDone?.();
            }}
          />
        ))}
      </div>
    </div>
  );
};

type MoveSpaceItemProps = {
  space: ReturnType<typeof useSpacesWhereMember>[number];
  onSelect: () => void;
};

const MoveSpaceItem = ({ space, onSelect }: MoveSpaceItemProps) => {
  return (
    <button
      onClick={() => {
        onSelect();
      }}
      className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01"
    >
      <div className="relative size-4 rounded bg-grey-01">
        <GeoImage value={space.entity.image} fill style={{ objectFit: 'cover' }} alt="" />
      </div>
      <div className="text-button text-text">{space.entity.name}</div>
    </button>
  );
};
