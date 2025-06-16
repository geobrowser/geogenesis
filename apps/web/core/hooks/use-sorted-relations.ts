'use client';

import * as React from 'react';

import { RelationRenderableProperty } from '~/core/types';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { sortRelationsWithIndices, RelationWithIndex } from '~/core/utils/relations';

interface UseSortedRelationsProps {
  relations: RelationRenderableProperty[];
}

/**
 * Hook for sorting relations by their index for display purposes.
 * This is the read-only version of useReorderableRelations.
 */
export function useSortedRelations({ relations }: UseSortedRelationsProps) {
  const { relations: allRelations } = useEntityPageStore();

  const relationIndexMap = React.useMemo(() => {
    const map = new Map<string, string>();
    allRelations.forEach(relation => {
      map.set(relation.id, relation.index);
    });
    return map;
  }, [allRelations]);

  const sortedRelations = React.useMemo(() => {
    return sortRelationsWithIndices(relations, relationIndexMap);
  }, [relations, relationIndexMap]);

  return {
    sortedRelations,
  };
}