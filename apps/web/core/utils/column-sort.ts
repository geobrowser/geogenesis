import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import type { DataType, Property } from '~/core/types';

export type SortDirection = 'asc' | 'desc';

export type ColumnSortState = {
  columnId: string;
  direction: SortDirection;
} | null;

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

export function propertySortLabel(property: Property): string {
  const known = DEFAULT_TABLE_SORT_PROPERTIES.find(p => ID.equals(p.id, property.id));
  if (known?.name) return known.name;
  return property.name ?? property.id;
}

export function nextSortDirection(current: ColumnSortState, columnId: string): ColumnSortState {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}
