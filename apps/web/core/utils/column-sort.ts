import { SystemIds } from '@geoprotocol/geo-sdk';

import { reactiveRelations, reactiveValues } from '~/core/sync/store';
import type { Property, Row } from '~/core/types';

import type { PowerToolsRow } from '~/partials/power-tools/types';

export type SortDirection = 'asc' | 'desc';

export type ColumnSortState = {
  columnId: string;
  direction: SortDirection;
} | null;

export function nextSortDirection(current: ColumnSortState, columnId: string): ColumnSortState {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

type DataType = Property['dataType'];

function getColumnSortKey(
  entityId: string,
  propertyId: string,
  spaceId: string,
  dataType: DataType | undefined,
  valuesSnapshot: ReturnType<typeof reactiveValues.get>,
  relationsSnapshot: ReturnType<typeof reactiveRelations.get>
): string {
  if (dataType === 'RELATION' || propertyId === SystemIds.TYPES_PROPERTY) {
    const match = relationsSnapshot.find(r => r.fromEntity.id === entityId && r.type.id === propertyId && !r.isDeleted);
    return (match?.toEntity.name ?? '').toLowerCase();
  }

  let fallbackValue: string | null = null;

  for (const v of valuesSnapshot) {
    if (v.entity.id !== entityId || v.property.id !== propertyId || v.isDeleted) continue;
    if (v.spaceId === spaceId) {
      return buildSortKey(v.value, dataType);
    }
    fallbackValue ??= v.value;
  }

  return fallbackValue !== null ? buildSortKey(fallbackValue, dataType) : '';
}

function buildSortKey(raw: string, dataType: DataType | undefined): string {
  if (!raw) return '';

  if (dataType === 'INTEGER' || dataType === 'FLOAT' || dataType === 'DECIMAL') {
    const n = parseFloat(raw);
    if (isNaN(n)) return '';
    // Prefix so negatives sort before positives in lexicographic order
    return n < 0 ? '0' + String(1e15 + n).padStart(20, '0') : '1' + String(n).padStart(20, '0');
  }

  return raw.toLowerCase();
}

// Pre-compute sort keys to avoid O(n*m) store scans in the comparator.
function buildSortKeyMap(
  entityIds: { entityId: string; spaceId: string }[],
  columnId: string,
  dataType: DataType | undefined
): Map<string, string> {
  const values = reactiveValues.get();
  const relations = reactiveRelations.get();
  const keyMap = new Map<string, string>();

  for (const { entityId, spaceId } of entityIds) {
    keyMap.set(entityId, getColumnSortKey(entityId, columnId, spaceId, dataType, values, relations));
  }

  return keyMap;
}

function compareKeys(aKey: string, bKey: string, multiplier: number): number {
  // Empty values always sort to the bottom regardless of direction
  if (aKey === '' && bKey !== '') return 1;
  if (aKey !== '' && bKey === '') return -1;
  if (aKey < bKey) return -1 * multiplier;
  if (aKey > bKey) return 1 * multiplier;
  return 0;
}

export function sortRowsByColumn(
  rows: Row[],
  sort: ColumnSortState,
  propertiesById: Record<string, Property>,
  spaceId: string
): Row[] {
  if (!sort) return rows;

  const { columnId, direction } = sort;
  const property = propertiesById[columnId];
  const dataType = property?.dataType;
  const multiplier = direction === 'asc' ? 1 : -1;

  const keyMap = buildSortKeyMap(
    rows.map(r => ({ entityId: r.entityId, spaceId })),
    columnId,
    dataType
  );

  return [...rows].sort((a, b) => {
    if (a.placeholder && !b.placeholder) return -1;
    if (!a.placeholder && b.placeholder) return 1;
    return compareKeys(keyMap.get(a.entityId) ?? '', keyMap.get(b.entityId) ?? '', multiplier);
  });
}

export function sortPowerToolsRowsByColumn(
  rows: PowerToolsRow[],
  sort: ColumnSortState,
  propertiesById: Record<string, Property>,
  defaultSpaceId: string
): PowerToolsRow[] {
  if (!sort) return rows;

  const { columnId, direction } = sort;
  const property = propertiesById[columnId];
  const dataType = property?.dataType;
  const multiplier = direction === 'asc' ? 1 : -1;

  const keyMap = buildSortKeyMap(
    rows.map(r => ({ entityId: r.entityId, spaceId: r.toSpaceId ?? r.spaceId ?? defaultSpaceId })),
    columnId,
    dataType
  );

  return [...rows].sort((a, b) => {
    if (a.placeholder && !b.placeholder) return -1;
    if (!a.placeholder && b.placeholder) return 1;
    return compareKeys(keyMap.get(a.entityId) ?? '', keyMap.get(b.entityId) ?? '', multiplier);
  });
}
