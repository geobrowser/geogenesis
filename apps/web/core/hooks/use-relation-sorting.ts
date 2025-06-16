'use client';

import * as React from 'react';

import { RelationRenderableProperty } from '~/core/types';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { sortRelationsWithIndices } from '~/core/utils/relations';

interface UseRelationSortingProps {
  relations: RelationRenderableProperty[];
}

/**
 * Shared hook for sorting relations by their index values.
 * Handles the common pattern of creating relation index map and sorting relations.
 */
export function useRelationSorting({ relations }: UseRelationSortingProps) {
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
    relationIndexMap,
  };
}