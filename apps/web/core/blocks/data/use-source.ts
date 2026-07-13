'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { produce } from 'immer';

import { EntityId, SpaceId } from '~/core/io/substream-schema';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter } from './filters';
import { Source, getSource, sourceStableKey, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';

type UseSourceOptions = {
  filterState: Filter[];
  setFilterState: (filters: Filter[]) => void;
};

export function useSource({ filterState, setFilterState }: UseSourceOptions) {
  const { entityId, spaceId, knownSourceType } = useDataBlockInstance();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
  });

  const dataEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const derivedSource: Source = getSource({
    blockId: EntityId(entityId),
    dataEntityRelations,
    currentSpaceId: SpaceId(spaceId),
    filterState,
    knownSourceType,
  });
  const derivedSourceKey = sourceStableKey(derivedSource);
  const [optimisticSource, setOptimisticSource] = React.useState<Source | null>(null);
  const source: Source = optimisticSource ?? derivedSource;

  React.useEffect(() => {
    setOptimisticSource(prev => (prev && sourceStableKey(prev) === derivedSourceKey ? null : prev));
  }, [derivedSourceKey]);

  React.useEffect(() => {
    setOptimisticSource(null);
  }, [entityId, spaceId]);

  const setSource = React.useCallback(
    (newSource: Source, options?: { filterStateOverride?: Filter[] }) => {
      const baseFilters = options?.filterStateOverride ?? filterState;

      setOptimisticSource(newSource);
      upsertSourceType({
        source: newSource,
        blockId: EntityId(entityId),
        spaceId: SpaceId(spaceId),
        dataEntityRelations,
      });

      if (newSource.type === 'COLLECTION') {
        setFilterState(
          produce(baseFilters, draft =>
            draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
          )
        );
      }

      if (newSource.type === 'RELATIONS') {
        setFilterState(
          produce(baseFilters, draft => {
            const next = draft.filter(
              f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY
            );
            next.push({
              columnId: SystemIds.RELATION_FROM_PROPERTY,
              columnName: 'From',
              valueType: 'RELATION',
              value: newSource.value,
              valueName: newSource.name,
            });
            return next;
          })
        );
      }

      if (newSource.type === 'SPACES') {
        setFilterState(
          produce(baseFilters, draft => {
            const next = draft.filter(
              f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY
            );
            for (const spaceId of [...new Set(newSource.value)]) {
              next.push({
                columnId: SystemIds.SPACE_FILTER,
                columnName: 'Space',
                valueType: 'RELATION',
                value: spaceId,
                valueName: newSource.nameById?.[spaceId] ?? null,
              });
            }
            return next;
          })
        );
      }

      if (newSource.type === 'GEO') {
        setFilterState(
          produce(baseFilters, draft =>
            draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
          )
        );
      }
    },
    [entityId, spaceId, dataEntityRelations, filterState, setFilterState]
  );

  return {
    source,
    setSource,
  };
}
