import { ID } from '~/core/id';

import { isBacklinkFilter } from './filter-state-to-where';
import type { Filter, FilterMode } from './filters';

/**
 * Personal browse-mode dropdown selections for one data block.
 *
 * Keys are property (column) ids; values are the entity ids the user checked.
 * Only USER OVERRIDES are stored — a property with no entry follows the
 * block's own filter (which is also how dropdowns default to the filter).
 * Selections are a per-user view kept in localStorage; they never modify the
 * block's persisted filters.
 */
export type DropdownSelections = Record<string, string[]>;

const STORAGE_PREFIX = 'tableDropdownSelections:';

/** One key per block relation entity, so the view is scoped to that table. */
export function dropdownSelectionsStorageKey(blocksRelationEntityId: string): string {
  return `${STORAGE_PREFIX}${blocksRelationEntityId}`;
}

/** Missing/corrupt storage means "no overrides" — never guess a selection. */
export function parseStoredDropdownSelections(raw: string | null): DropdownSelections {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const selections: DropdownSelections = {};
    for (const [columnId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (ids.length > 0) selections[columnId] = [...new Set(ids)];
    }
    return selections;
  } catch {
    return {};
  }
}

/** The block filter's own values for a column — the dropdown's default. */
export function filterDefaultsForColumn(filterState: Filter[], columnId: string): string[] {
  return filterState.filter(f => ID.equals(f.columnId, columnId) && !isBacklinkFilter(f)).map(f => f.value);
}

function sameIdSet(a: string[], b: string[]): boolean {
  // Ids arrive in dashed and dashless forms from different sources (GraphQL
  // vs normalized writes); compare like ID.equals does everywhere else, or a
  // re-checked default would register as a phantom override.
  if (a.length !== b.length) return false;
  return a.every(id => b.some(other => ID.equals(id, other)));
}

/**
 * Toggle one option and normalize:
 * - an override equal to the filter default is dropped (the dropdown goes
 *   back to following the block's filter, including future filter edits);
 * - unchecking every option also drops the override rather than meaning
 *   "match nothing".
 */
export function toggleDropdownSelection(
  selections: DropdownSelections,
  columnId: string,
  optionId: string,
  filterDefaults: string[]
): DropdownSelections {
  const current = selections[columnId] ?? filterDefaults;
  const next = current.some(id => ID.equals(id, optionId))
    ? current.filter(id => !ID.equals(id, optionId))
    : [...current, optionId];

  const nextSelections = { ...selections };
  if (next.length === 0 || sameIdSet(next, filterDefaults)) {
    delete nextSelections[columnId];
  } else {
    nextSelections[columnId] = next;
  }
  return nextSelections;
}

/** What the dropdown shows as checked: the override, else the filter default. */
export function effectiveDropdownSelection(
  selections: DropdownSelections,
  columnId: string,
  filterDefaults: string[]
): string[] {
  return selections[columnId] ?? filterDefaults;
}

/**
 * Overlay personal selections onto the block's filter state before
 * where-building. For each overridden property: its persisted filters are
 * replaced by one relation filter per selected entity, and the property is
 * marked OR — multiple checks act as an OR within the property, identical to
 * the per-property filter modes (the same `filterStateToWhere` transformer
 * consumes the result; nothing is duplicated).
 *
 * Filters on properties without an override — and non-relation filters — pass
 * through untouched. The block's persisted filter state is never modified.
 */
export function applyDropdownSelectionsToFilters(
  filterState: Filter[],
  modesByColumn: Record<string, FilterMode>,
  selections: DropdownSelections,
  dropdownColumnIds: string[]
): { filterState: Filter[]; modesByColumn: Record<string, FilterMode> } {
  const overriddenColumns = dropdownColumnIds.filter(columnId => selections[columnId] !== undefined);
  if (overriddenColumns.length === 0) return { filterState, modesByColumn };

  const nextFilters = filterState.filter(
    f => !overriddenColumns.some(columnId => ID.equals(f.columnId, columnId) && !isBacklinkFilter(f))
  );
  const nextModes: Record<string, FilterMode> = { ...modesByColumn };

  for (const columnId of overriddenColumns) {
    const baseForColumn = filterState.filter(f => ID.equals(f.columnId, columnId) && !isBacklinkFilter(f));
    const template = baseForColumn[0];
    for (const entityId of selections[columnId]) {
      // A still-checked base filter is kept verbatim, so its valueName and
      // space scoping (typesRelationSpaceId) survive; only genuinely new
      // values are synthesized — inheriting the column's scoping fields.
      const existing = baseForColumn.find(f => ID.equals(f.value, entityId));
      nextFilters.push(
        existing ?? {
          columnId,
          columnName: template?.columnName ?? null,
          valueType: 'RELATION',
          value: entityId,
          valueName: null,
          relationValueTypes: template?.relationValueTypes,
          typesRelationSpaceId: template?.typesRelationSpaceId,
        }
      );
    }
    if (selections[columnId].length > 1) {
      nextModes[columnId] = 'OR';
    } else {
      // With a single selection the forward group's mode is irrelevant.
      // Backlink filters live in their own logical group (filterGroupKey)
      // and never read this entry, so deleting is always safe.
      delete nextModes[columnId];
    }
  }

  return { filterState: nextFilters, modesByColumn: nextModes };
}
