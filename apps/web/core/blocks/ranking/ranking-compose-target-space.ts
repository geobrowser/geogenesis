import type { Filter } from '~/core/blocks/data/filters';

import { getScopeFromFilters } from './ranking-scope';

export function resolveRankingSingleTargetSpaceId(filterState: Filter[]): string | null {
  const scope = getScopeFromFilters(filterState);
  if (scope.type !== 'SPACES') return null;

  const spaceIds = [...new Set(scope.value.filter(Boolean))];
  if (spaceIds.length !== 1) return null;

  return spaceIds[0]!;
}
