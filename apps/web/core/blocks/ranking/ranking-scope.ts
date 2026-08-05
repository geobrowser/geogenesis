import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Filter } from '~/core/blocks/data/filters';
import type { Source } from '~/core/blocks/data/source';

function uniqueSpaceFilterIds(filterState: Filter[]): string[] {
  return [...new Set(filterState.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value))];
}

/**
 * Ranking blocks never persist a data-source-type relation — their scope is
 * derived purely from the filters stored on the block. Maps a filter state to
 * the {@link Source} used to query rankable entities, defaulting to the full
 * Geo graph when no scoping filters are set.
 */
export function getScopeFromFilters(filterState: Filter[]): Source {
  const maybeEntityFilter = filterState.find(f => f.columnId === SystemIds.RELATION_FROM_PROPERTY);

  if (maybeEntityFilter) {
    return {
      type: 'RELATIONS',
      value: maybeEntityFilter.value,
      name: maybeEntityFilter.valueName,
    };
  }

  const spaceIdsFromFilters = uniqueSpaceFilterIds(filterState);
  if (spaceIdsFromFilters.length > 0) {
    return {
      type: 'SPACES',
      value: spaceIdsFromFilters,
    };
  }

  return { type: 'GEO' };
}
