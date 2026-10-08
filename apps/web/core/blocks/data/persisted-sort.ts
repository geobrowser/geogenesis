import { type BuiltInSort, type ColumnSortState, type SortDirection, isBuiltInSort } from '~/core/utils/column-sort';

type PersistedDirection = 'ascending' | 'descending';

/**
 * Wire format of a data block's Sort property (GEO-1974).
 *
 * `sort_by` carries a property id. Built-in sorts are not properties, so they
 * travel under `order_by` instead: a reader that only knows `sort_by` then sees
 * no sort and falls back to the default order, rather than forwarding a non-id
 * to the per-property ordering function.
 */
export type PersistedSort =
  | { sort_by: string; sort_direction: PersistedDirection }
  | { order_by: BuiltInSort; sort_direction: PersistedDirection };

/** Anything missing, unparseable or unknown reads as "no sort". */
export function parsePersistedSort(raw: string | null | undefined): ColumnSortState {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const { sort_by, order_by, sort_direction } = parsed as Record<string, unknown>;
  if (!sort_direction) return null;
  const direction: SortDirection = sort_direction === 'ascending' ? 'asc' : 'desc';

  if (typeof sort_by === 'string' && sort_by !== '') {
    return { kind: 'property', columnId: sort_by, direction };
  }
  if (isBuiltInSort(order_by)) {
    return { kind: 'builtin', sort: order_by, direction };
  }
  return null;
}

/** The empty string clears the sort. */
export function serializeSort(sort: ColumnSortState): string {
  if (!sort) return '';
  const sort_direction: PersistedDirection = sort.direction === 'asc' ? 'ascending' : 'descending';
  const persisted: PersistedSort =
    sort.kind === 'property' ? { sort_by: sort.columnId, sort_direction } : { order_by: sort.sort, sort_direction };
  return JSON.stringify(persisted);
}
