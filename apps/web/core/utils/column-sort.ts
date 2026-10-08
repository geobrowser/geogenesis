import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { BEST_ORDER_BY, NEWEST_ORDER_BY } from '~/core/io/entity-order-by';
import type { DataType, Property } from '~/core/types';

export type SortDirection = 'asc' | 'desc';

/**
 * Sorts that are not backed by a property on the entity. A property sort runs
 * through the per-property ordering function; a built-in sort is an entity-level
 * `orderBy` on the entities connection instead.
 * - `best`: the indexer's ranking score, the same score Explore's Best uses.
 * - `created_at`: when the entity was first indexed.
 *
 * The same keys are the persisted `order_by` values (see `persisted-sort.ts`).
 */
export const BUILT_IN_SORTS = ['best', 'created_at'] as const;
export type BuiltInSort = (typeof BUILT_IN_SORTS)[number];

export function isBuiltInSort(value: unknown): value is BuiltInSort {
  return typeof value === 'string' && (BUILT_IN_SORTS as readonly string[]).includes(value);
}

export type PropertySortState = { kind: 'property'; columnId: string; direction: SortDirection };
export type BuiltInSortState = { kind: 'builtin'; sort: BuiltInSort; direction: SortDirection };
export type ColumnSortState = PropertySortState | BuiltInSortState | null;

export type BuiltInSortOption = {
  sort: BuiltInSort;
  label: string;
  /** Directions the menu offers. A single entry applies on click with no direction step. */
  directions: readonly SortDirection[];
};

export const BUILT_IN_SORT_OPTIONS: readonly BuiltInSortOption[] = [
  { sort: 'best', label: 'Best', directions: ['desc'] },
  { sort: 'created_at', label: 'Created', directions: ['asc', 'desc'] },
];

export function builtInSortLabel(sort: BuiltInSort): string {
  return BUILT_IN_SORT_OPTIONS.find(option => option.sort === sort)?.label ?? sort;
}

/** Server ordering for a built-in sort; descending is the shared Best / Newest order. */
export function builtInSortOrderBy({ sort, direction }: BuiltInSortState): EntitiesOrderBy[] {
  switch (sort) {
    case 'best':
      return direction === 'asc'
        ? [EntitiesOrderBy.RankingScoreAsc, EntitiesOrderBy.UpdatedAtAsc, EntitiesOrderBy.IdAsc]
        : BEST_ORDER_BY;
    case 'created_at':
      return direction === 'asc' ? [EntitiesOrderBy.CreatedAtAsc, EntitiesOrderBy.IdAsc] : NEWEST_ORDER_BY;
  }
}

export const SORTABLE_DATA_TYPES: readonly DataType[] = [
  'TEXT',
  'INTEGER',
  'FLOAT',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'TIME',
  'DATETIME',
  'POINT',
];

/** Always available in the table sort dropdown, even when hidden from columns. */
export const DEFAULT_TABLE_SORT_PROPERTIES: readonly Property[] = [
  { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
  { id: SCORE_SYSTEM_PROPERTY, name: 'Score', dataType: 'INTEGER' },
];

export function propertyForSort(columnId: string, properties: Property[]): Property | undefined {
  return (
    properties.find(p => ID.equals(p.id, columnId)) ??
    DEFAULT_TABLE_SORT_PROPERTIES.find(p => ID.equals(p.id, columnId))
  );
}

export function shouldIncludeWithoutValueForPropertySort(propertyId: string): boolean {
  return ID.equals(propertyId, SCORE_SYSTEM_PROPERTY);
}

export function propertySortLabel(property: Property): string {
  const known = DEFAULT_TABLE_SORT_PROPERTIES.find(p => ID.equals(p.id, property.id));
  if (known?.name) return known.name;
  return property.name ?? property.id;
}

/** Display label for an active sort: the built-in name, or the property name with its id as fallback. */
export function sortStateLabel(sortState: NonNullable<ColumnSortState>, properties: Property[]): string {
  if (sortState.kind === 'builtin') return builtInSortLabel(sortState.sort);
  const property = propertyForSort(sortState.columnId, properties);
  return property ? propertySortLabel(property) : sortState.columnId;
}

export function nextSortDirection(current: ColumnSortState, columnId: string): ColumnSortState {
  if (current?.kind !== 'property' || current.columnId !== columnId) {
    return { kind: 'property', columnId, direction: 'asc' };
  }
  if (current.direction === 'asc') return { kind: 'property', columnId, direction: 'desc' };
  return null;
}
