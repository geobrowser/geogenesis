'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { EntityPageTitle } from './entity-page-title';

export function EditableHeading({
  spaceId,
  entityId,
  fallbackName,
}: {
  spaceId: string;
  entityId: string;
  /** Shown in browse mode when the scoped store has no name yet (e.g. ranking row preview). */
  fallbackName?: string | null;
}) {
  const { values } = useSyncEngine();

  const name = useSelector(values, v => {
    return v.find(
      v =>
        v.entity.id === entityId && v.spaceId === spaceId && v.property.id === SystemIds.NAME_PROPERTY && !v.isDeleted
    )?.value;
  });

  const isEditing = useUserIsEditing(spaceId);
  const { storage } = useMutate();

  const onNameChange = (value: string) => {
    storage.entities.name.set(entityId, spaceId, value);
  };

  return (
    <EntityPageTitle
      value={name ?? fallbackName ?? ''}
      isEditing={isEditing}
      onChange={onNameChange}
      className="min-w-0"
    />
  );
}
