'use client';

import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useState } from 'react';

import { IdUtils } from '@geoprotocol/geo-sdk';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Input } from '~/design-system/input';

type CreateNewVersionInSpaceProps = {
  entityId: EntityId;
  entityName?: string;
  sourceSpaceId: string;
  setIsCreatingNewVersion: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
};

export const CreateNewVersionInSpace = ({
  entityId,
  entityName,
  sourceSpaceId,
  setIsCreatingNewVersion,
  onDone,
}: CreateNewVersionInSpaceProps) => {
  const router = useRouter();
  const { storage } = useMutate();

  const { personalSpaceId } = usePersonalSpaceId();
  const spaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  const [query, setQuery] = useState<string>('');

  const namedSpaces = spaces.filter(space => space?.entity?.name?.trim());

  const renderedSpaces =
    query.length === 0
      ? namedSpaces
      : namedSpaces.filter(space => space?.entity?.name?.toLowerCase()?.includes(query.toLowerCase()));

  const cloneEntityIntoSpace = (targetSpaceId: string) => {
    if (!targetSpaceId || targetSpaceId === sourceSpaceId) return;

    const sourceValues = getValues({
      selector: value => value.entity.id === entityId && value.spaceId === sourceSpaceId,
    });

    const sourceRelations = getRelations({
      selector: relation => relation.fromEntity.id === entityId && relation.spaceId === sourceSpaceId,
    });

    const existingTargetValueIds = new Set(
      getValues({
        selector: value => value.entity.id === entityId && value.spaceId === targetSpaceId,
      }).map(value => value.id)
    );

    const existingTargetRelationSignatures = new Set(
      getRelations({
        selector: relation => relation.fromEntity.id === entityId && relation.spaceId === targetSpaceId,
      }).map(
        relation =>
          `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${relation.toSpaceId ?? ''}|${
            relation.renderableType
          }`
      )
    );

    sourceValues.forEach(value => {
      const id = ID.createValueId({
        entityId: value.entity.id,
        propertyId: value.property.id,
        spaceId: targetSpaceId,
      });

      if (existingTargetValueIds.has(id)) return;

      storage.values.set({
        ...value,
        id,
        spaceId: targetSpaceId,
        entity: { ...value.entity },
        property: { ...value.property },
      });
    });

    sourceRelations.forEach(relation => {
      const signature = `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${
        relation.toSpaceId ?? ''
      }|${relation.renderableType}`;

      if (existingTargetRelationSignatures.has(signature)) return;

      storage.relations.set({
        ...relation,
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId: targetSpaceId,
        fromEntity: { ...relation.fromEntity },
        toEntity: { ...relation.toEntity },
        type: { ...relation.type },
      });
    });
  };

  return (
    <div className="bg-white">
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsCreatingNewVersion(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-[4] p-2 text-center text-button text-text">Select space to create in</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="flex max-h-[190px] flex-col gap-1 overflow-auto p-1">
        {renderedSpaces.map(space => (
          <CreateVersionSpaceItem
            key={space.id}
            space={space}
            onSelect={() => {
              cloneEntityIntoSpace(space.id);
              router.push(NavUtils.toEntity(space.id, entityId, true, entityName));
              onDone?.();
            }}
          />
        ))}
      </div>
    </div>
  );
};

type CreateVersionSpaceItemProps = {
  space: ReturnType<typeof useSpacesWhereMember>[number];
  onSelect: () => void;
};

const CreateVersionSpaceItem = ({ space, onSelect }: CreateVersionSpaceItemProps) => {
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
