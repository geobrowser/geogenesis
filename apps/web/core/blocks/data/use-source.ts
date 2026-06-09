'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { produce } from 'immer';

import { isRankingBlockEntity } from '~/core/blocks/ranking/ranking-block-state';
import { EntityId, SpaceId } from '~/core/io/substream-schema';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter } from './filters';
import { Source, getSource, removeSourceType, sourceStableKey, upsertSourceType } from './source';
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

function applySourceToFilters(newSource: Source, baseFilters: Filter[], setFilterState: (filters: Filter[]) => void) {
  if (newSource.type === 'COLLECTION') {
    setFilterState(
      produce(baseFilters, draft =>
        draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
      )
    );
    return;
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
    return;
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
    return;
  }

  if (newSource.type === 'GEO') {
    setFilterState(
      produce(baseFilters, draft =>
        draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
      )
    );
  }
}

export function useSource({ filterState, setFilterState }: UseSourceOptions) {
  const { entityId, spaceId } = useDataBlockInstance();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
  });

  const dataEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const isRankingBlock = React.useMemo(
    () => isRankingBlockEntity(entityId, dataEntityRelations, spaceId),
    [dataEntityRelations, entityId, spaceId]
  );

  const derivedSource: Source = getSource({
    blockId: EntityId(entityId),
    dataEntityRelations,
    currentSpaceId: SpaceId(spaceId),
    filterState,
    scopeFromFiltersOnly: isRankingBlock,
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

  // Strip legacy data-source relations from ranking blocks (not in ranking ontology).
  React.useEffect(() => {
    if (!isRankingBlock) return;
    if (!hasDataSourceTypeRelation(entityId, dataEntityRelations)) return;
    removeSourceType({ blockId: entityId, dataEntityRelations });
  }, [dataEntityRelations, entityId, isRankingBlock]);

  const setSource = React.useCallback(
    (newSource: Source, options?: { filterStateOverride?: Filter[] }) => {
      const baseFilters = options?.filterStateOverride ?? filterState;

      setOptimisticSource(newSource);

      if (!isRankingBlock) {
        upsertSourceType({
          source: newSource,
          blockId: EntityId(entityId),
          spaceId: SpaceId(spaceId),
          dataEntityRelations,
        });
      }

      applySourceToFilters(newSource, baseFilters, setFilterState);
    },
    [dataEntityRelations, entityId, filterState, isRankingBlock, setFilterState, spaceId]
  );

  return {
    source,
    setSource,
  };
}
