import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

import type { Filter } from './filters';

export type ExploreBlockTypeOption = {
  id: string;
  label: string;
};

export function getExploreBlockTypeOptions(filters: readonly Filter[]): ExploreBlockTypeOption[] {
  const options: ExploreBlockTypeOption[] = [];

  for (const filter of filters) {
    if (!ID.equals(filter.columnId, SystemIds.TYPES_PROPERTY)) continue;
    if (options.some(option => ID.equals(option.id, filter.value))) continue;
    options.push({ id: filter.value, label: filter.valueName ?? filter.value });
  }

  return options;
}

export function refineExploreBlockTypeFilters(
  filters: readonly Filter[],
  selectedTypeIds: readonly string[] | undefined
): { filters: Filter[]; hasConfiguredTypes: boolean; hasNoSelectedTypes: boolean } {
  const hasConfiguredTypes = filters.some(filter => ID.equals(filter.columnId, SystemIds.TYPES_PROPERTY));

  if (!hasConfiguredTypes || selectedTypeIds === undefined) {
    return { filters: [...filters], hasConfiguredTypes, hasNoSelectedTypes: false };
  }

  const selected = selectedTypeIds.map(ID.uuidToHex);
  return {
    filters: filters.filter(
      filter => !ID.equals(filter.columnId, SystemIds.TYPES_PROPERTY) || selected.includes(ID.uuidToHex(filter.value))
    ),
    hasConfiguredTypes: true,
    hasNoSelectedTypes: selected.length === 0,
  };
}

export function applyExploreBrowseWhere(
  baseWhere: WhereCondition,
  options: { hasNoSelectedTypes: boolean; timeThresholdSec: number | null }
): WhereCondition {
  if (options.hasNoSelectedTypes) return { id: { in: [] } };
  if (options.timeThresholdSec === null) return baseWhere;

  const createdAtWhere: WhereCondition = {
    createdAt: { greaterThanOrEqualTo: String(options.timeThresholdSec) },
  };
  return Object.keys(baseWhere).length === 0 ? createdAtWhere : { AND: [baseWhere, createdAtWhere] };
}
