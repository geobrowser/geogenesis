'use client';

import * as React from 'react';

import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { type EntityVoteDirectionFilter, useUserVotedEntityIds } from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

/**
 * Entities for the Upvoted / Downvoted browse tabs.
 */
export function useVoteTabEntities(direction: EntityVoteDirectionFilter | null) {
  const { filterState, filterMode } = useDataBlock();
  const blockWhere = React.useMemo(() => filterStateToWhere(filterState, filterMode), [filterState, filterMode]);

  const enabled = direction !== null;
  const { ids, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useUserVotedEntityIds(
    direction ?? 'up',
    enabled
  );

  const where = React.useMemo(() => ({ ...blockWhere, id: { in: ids } }), [blockWhere, ids]);

  const { entities, isLoading: isLoadingEntities } = useQueryEntities({
    where,
    first: ids.length,
    enabled: enabled && ids.length > 0,
  });

  const orderedIds = React.useMemo(() => {
    if (!enabled) return [];

    const voteOrder = new Map(ids.map((id, index) => [id, index]));

    return (entities ?? [])
      .map(entity => ({ id: entity.id, order: voteOrder.get(ID.uuidToHex(entity.id)) }))
      .filter((entry): entry is { id: string; order: number } => entry.order !== undefined)
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.id);
  }, [enabled, entities, ids]);

  return {
    orderedIds,
    isLoading: isLoading || (ids.length > 0 && isLoadingEntities),
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
