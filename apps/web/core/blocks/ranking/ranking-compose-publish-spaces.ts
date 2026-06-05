import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Filter } from '~/core/blocks/data/filters';
import type { Source } from '~/core/blocks/data/source';

/**
 * Spaces where a new rankable entity may be published, from the ranking block's data scope.
 */
export function getRankingPublishSpaceIds(source: Source, filterState: Filter[], pageSpaceId: string): string[] {
  if (source.type === 'SPACES' && source.value.length > 0) {
    return [...new Set(source.value)];
  }

  const fromFilters = [
    ...new Set(
      filterState
        .filter(f => f.columnId === SystemIds.SPACE_FILTER)
        .map(f => f.value)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (fromFilters.length > 0) {
    return fromFilters;
  }

  return [pageSpaceId];
}
