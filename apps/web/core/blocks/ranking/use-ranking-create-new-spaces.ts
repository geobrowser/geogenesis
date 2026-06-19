'use client';

import * as React from 'react';

import type { Filter } from '~/core/blocks/data/filters';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { canCreateEntityInSpace, useQueryFromSpacesList } from '~/core/hooks/use-query-from-spaces-list';

import { getScopeFromFilters } from './ranking-scope';

export type RankingCreateNewSpaces = {
  canCreateNew: boolean;
  memberSpaceIds: string[];
  defaultPublishSpaceId: string | null;
  isResolved: boolean;
};

export function useRankingCreateNewSpaces(
  filterState: Filter[],
  pageSpaceId: string,
  enabled: boolean
): RankingCreateNewSpaces {
  const { personalSpaceId } = usePersonalSpaceId();
  const { data: spacesList, isLoading } = useQueryFromSpacesList(personalSpaceId ?? undefined, enabled);

  return React.useMemo(() => {
    const ordering = spacesList.ordering;
    const isResolved = Boolean(personalSpaceId) && !isLoading;

    const memberSpaceIds = [
      ...new Set(
        [
          ...spacesList.sections.editors.map(r => r.id),
          ...spacesList.sections.members.map(r => r.id),
          ...(personalSpaceId ? [personalSpaceId] : []),
        ].filter(Boolean)
      ),
    ];

    const canPublishInto = (id: string) => id === personalSpaceId || canCreateEntityInSpace(id, ordering);

    const scope = getScopeFromFilters(filterState);
    const filterSpaceIds = scope.type === 'SPACES' ? [...new Set(scope.value)] : [];

    let canCreateNew: boolean;
    if (scope.type === 'SPACES' && filterSpaceIds.length > 0) {
      canCreateNew = filterSpaceIds.some(canPublishInto);
    } else {
      canCreateNew = memberSpaceIds.length > 0;
    }

    const pageSpaceIsCandidate = scope.type === 'SPACES' ? filterSpaceIds.includes(pageSpaceId) : true;

    let defaultPublishSpaceId: string | null;
    if (pageSpaceIsCandidate && canPublishInto(pageSpaceId)) {
      defaultPublishSpaceId = pageSpaceId;
    } else if (personalSpaceId && canPublishInto(personalSpaceId)) {
      defaultPublishSpaceId = personalSpaceId;
    } else {
      defaultPublishSpaceId = memberSpaceIds[0] ?? null;
    }

    return { canCreateNew, memberSpaceIds, defaultPublishSpaceId, isResolved };
  }, [spacesList, personalSpaceId, isLoading, filterState, pageSpaceId]);
}
