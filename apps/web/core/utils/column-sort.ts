import type { DataType } from '~/core/types';

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

export function nextSortDirection(current: ColumnSortState, columnId: string): ColumnSortState {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}
