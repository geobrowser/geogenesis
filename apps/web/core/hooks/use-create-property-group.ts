'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { focusPropertyGroupNameAtom } from '~/atoms';
import { COLLAPSED_PROPERTY, PROPERTY_GROUPS_PROPERTY, PROPERTY_GROUP_TYPE } from '~/core/constants';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations } from '~/core/sync/use-store';
import { sortRelations } from '~/core/utils/utils';

/**
 * Creates a new property group on a type entity. Property groups are an advanced
 * feature, so creation is buried in the "+" menu rather than shown as its own
 * labeled section. Returns the new group's entity id and flags its name input to
 * auto-focus via {@link focusPropertyGroupNameAtom}, since the groups editor can
 * render in a different page section than the trigger.
 */
export function useCreatePropertyGroup(entityId: string, spaceId: string) {
  const { storage } = useMutate();
  const setFocusGroupNameId = useSetAtom(focusPropertyGroupNameAtom);

  const propertyGroupRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === entityId &&
        relation.spaceId === spaceId &&
        relation.type.id === PROPERTY_GROUPS_PROPERTY,
    })
  );

  return React.useCallback(() => {
    const groupEntityId = ID.createEntityId();
    const lastGroupPosition = propertyGroupRelations.at(-1)?.position ?? null;

    storage.entities.name.set(groupEntityId, spaceId, '');
    storage.values.set({
      spaceId,
      entity: { id: groupEntityId, name: null },
      property: { id: COLLAPSED_PROPERTY, name: 'Collapsed', dataType: 'BOOLEAN' },
      value: '0',
    });

    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generate(),
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: groupEntityId, name: null },
      toEntity: { id: PROPERTY_GROUP_TYPE, name: 'Property group', value: PROPERTY_GROUP_TYPE },
    });

    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastGroupPosition, null),
      type: { id: PROPERTY_GROUPS_PROPERTY, name: 'Property groups' },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: groupEntityId, name: null, value: groupEntityId },
    });

    setFocusGroupNameId(groupEntityId);
    return groupEntityId;
  }, [entityId, propertyGroupRelations, setFocusGroupNameId, spaceId, storage]);
}
