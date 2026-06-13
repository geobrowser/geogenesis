import type { Filter } from '~/core/blocks/data/filters';

import { getScopeFromFilters } from './ranking-scope';

/**
 * Spaces from the ranking block's filter scope.
 */
export function getRankingPublishSpaceIds(filterState: Filter[], pageSpaceId: string): string[] {
  const scope = getScopeFromFilters(filterState);

  if (scope.type === 'SPACES' && scope.value.length > 0) {
    return [...new Set(scope.value)];
  }

  return [pageSpaceId];
}
