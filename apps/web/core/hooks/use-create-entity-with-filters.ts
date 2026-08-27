'use client';

import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { writeValue } from '~/partials/blocks/table/change-entry';

import { Filter } from '../blocks/data/filters';
import { useMutate } from '../sync/use-mutate';

export function useCreateEntityWithFilters(defaultSpaceId: string) {
  const nextEntityIdRef = React.useRef(IdUtils.generate());
  const [, bumpReservedEntityId] = React.useState(0);
  const { storage } = useMutate();

  const peekNextEntityId = React.useCallback(() => nextEntityIdRef.current, []);

  const rotateNextEntityId = React.useCallback(() => {
    nextEntityIdRef.current = IdUtils.generate();
    bumpReservedEntityId(n => n + 1);
  }, []);

  const onClick = React.useCallback(
    ({
      name,
      filters,
      spaceId: overrideSpaceId,
    }: {
      name?: string | null;
      filters?: Filter[];
      spaceId?: string | null;
    }) => {
      const entityId = nextEntityIdRef.current;
      const targetSpaceId = overrideSpaceId ? overrideSpaceId : defaultSpaceId;

      if (name) {
        storage.entities.name.set(entityId, targetSpaceId, name);
      }

      /**
       * Apply active table filters to the new entity: relation filters (types, etc.),
       * and TEXT property filters. Space filter is query UI only and is skipped.
       */
      const withoutSpace = filters?.filter(f => f.columnId !== SystemIds.SPACE_FILTER) ?? [];

      for (const filter of withoutSpace) {
        if (filter.valueType === 'RELATION') {
          storage.relations.set({
            id: IdUtils.generate(),
            entityId: IdUtils.generate(),
            spaceId: targetSpaceId,
            renderableType: 'RELATION',
            fromEntity: {
              id: entityId,
              name: null,
            },
            toEntity: {
              id: filter.value,
              name: filter.valueName,
              value: filter.value,
            },
            type: {
              id: filter.columnId,
              name: filter.columnName,
            },
          });
        } else if (filter.valueType === 'TEXT' && filter.columnId !== SystemIds.NAME_PROPERTY) {
          writeValue(
            storage,
            entityId,
            targetSpaceId,
            {
              id: filter.columnId,
              name: filter.columnName,
              dataType: 'TEXT',
            },
            filter.value,
            null
          );
        }
      }

      nextEntityIdRef.current = IdUtils.generate();
      bumpReservedEntityId(n => n + 1);
      return entityId;
    },
    [defaultSpaceId, storage]
  );

  return {
    onClick,
    peekNextEntityId,
    rotateNextEntityId,
  };
}
