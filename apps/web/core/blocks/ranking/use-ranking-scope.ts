'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { produce } from 'immer';

import type { Filter } from '~/core/blocks/data/filters';
import { type Source, removeSourceType, sourceStableKey } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';

import { getScopeFromFilters } from './ranking-scope';

type UseRankingScopeOptions = {
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

/**
 * Ranking counterpart of the data block's `useSource`.
 */
export function useRankingScope({ filterState, setFilterState }: UseRankingScopeOptions) {
  const { entityId, spaceId } = useDataBlockInstance();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
  });

  const blockEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const derivedSource: Source = getScopeFromFilters(filterState);
  const derivedSourceKey = sourceStableKey(derivedSource);
  const [optimisticSource, setOptimisticSource] = React.useState<Source | null>(null);
  const source: Source = optimisticSource ?? derivedSource;

  React.useEffect(() => {
    setOptimisticSource(prev => (prev && sourceStableKey(prev) === derivedSourceKey ? null : prev));
  }, [derivedSourceKey]);

  React.useEffect(() => {
    setOptimisticSource(null);
  }, [entityId, spaceId]);

  // A ranking block should never carry a data-source-type relation (e.g. left
  // over from a block that was previously treated as a data block) — remove it
  // so the filter-derived scope stays authoritative.
  React.useEffect(() => {
    if (!hasDataSourceTypeRelation(entityId, blockEntityRelations)) return;
    removeSourceType({ blockId: entityId, dataEntityRelations: blockEntityRelations });
  }, [blockEntityRelations, entityId]);

  const setSource = React.useCallback(
    (newSource: Source, options?: { filterStateOverride?: Filter[] }) => {
      const baseFilters = options?.filterStateOverride ?? filterState;

      setOptimisticSource(newSource);

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

      if (newSource.type === 'GEO' || newSource.type === 'COLLECTION') {
        setFilterState(
          produce(baseFilters, draft =>
            draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
          )
        );
      }
    },
    [filterState, setFilterState]
  );

  return {
    source,
    setSource,
  };
}
