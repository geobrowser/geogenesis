'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { produce } from 'immer';

import { EntityId, SpaceId } from '~/core/io/substream-schema';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter } from './filters';
import { Source, getScopeFromFilters, getSource, removeSourceType, sourceStableKey, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';

type UseSourceOptions = {
  filterState: Filter[];
  setFilterState: (filters: Filter[]) => void;
};

function hasDataSourceTypeRelation(
  entityId: string,
  relations: { fromEntity: { id: string }; type: { id: string }; isDeleted?: boolean }[]
) {
  return relations.some(
    r => r.fromEntity.id === entityId && r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE && !r.isDeleted
  );
}

export function useSource({ filterState, setFilterState }: UseSourceOptions) {
  const { entityId, spaceId, sourceMode } = useDataBlockInstance();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
  });

  const dataEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];
  const scopeFromFiltersOnly = sourceMode === 'filter-only';

  const derivedSource: Source = scopeFromFiltersOnly
    ? getScopeFromFilters(filterState)
    : getSource({
        blockId: EntityId(entityId),
        dataEntityRelations,
        currentSpaceId: SpaceId(spaceId),
        filterState,
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

  React.useEffect(() => {
    if (!scopeFromFiltersOnly) return;
    if (!hasDataSourceTypeRelation(entityId, dataEntityRelations)) return;
    removeSourceType({ blockId: entityId, dataEntityRelations });
  }, [dataEntityRelations, entityId, scopeFromFiltersOnly]);

  const setSource = React.useCallback(
    (newSource: Source, options?: { filterStateOverride?: Filter[] }) => {
      const baseFilters = options?.filterStateOverride ?? filterState;

      setOptimisticSource(newSource);

      if (!scopeFromFiltersOnly) {
        upsertSourceType({
          source: newSource,
          blockId: EntityId(entityId),
          spaceId: SpaceId(spaceId),
          dataEntityRelations,
        });
      }

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
            for (const space of [...new Set(newSource.value)]) {
              next.push({
                columnId: SystemIds.SPACE_FILTER,
                columnName: 'Space',
                valueType: 'RELATION',
                value: space,
                valueName: newSource.nameById?.[space] ?? null,
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
    [dataEntityRelations, entityId, filterState, scopeFromFiltersOnly, setFilterState, spaceId]
  );

  return {
    source,
    setSource,
  };
}
