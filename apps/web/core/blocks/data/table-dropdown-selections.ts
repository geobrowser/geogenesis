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

/** Per-dropdown combinator for the CHECKED options: union ('OR') or intersection ('AND'). */
export type DropdownSelectionMode = 'OR' | 'AND';
export type DropdownSelectionModes = Record<string, DropdownSelectionMode>;

/** Everything the per-user store persists for one block. */
export type StoredDropdownState = {
  selections: DropdownSelections;
  modes: DropdownSelectionModes;
};

const STORAGE_PREFIX = 'tableDropdownSelections:';

/** One key per block relation entity, so the view is scoped to that table. */
export function dropdownSelectionsStorageKey(blocksRelationEntityId: string): string {
  return `${STORAGE_PREFIX}${blocksRelationEntityId}`;
}

const EMPTY_STATE: StoredDropdownState = { selections: {}, modes: {} };

function parseSelectionsRecord(parsed: Record<string, unknown>): DropdownSelections {
  const selections: DropdownSelections = {};
  for (const [columnId, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) continue;
    const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) selections[columnId] = [...new Set(ids)];
  }
  return selections;
}

/**
 * Missing/corrupt storage means "no overrides" — never guess a selection.
 * Two shapes exist: the current `{ selections, modes }` envelope, and the
 * legacy bare `Record<columnId, string[]>` written before per-dropdown
 * modes existed (read as selections with no stored modes).
 */
export function parseStoredDropdownState(raw: string | null): StoredDropdownState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_STATE;
    const record = parsed as Record<string, unknown>;
    if (record.selections !== undefined) {
      // Envelope shape. An envelope with invalid selections is rejected
      // outright rather than legacy-parsed (the literal key 'selections'
      // must never become a pseudo-column).
      if (record.selections === null || typeof record.selections !== 'object' || Array.isArray(record.selections)) {
        return EMPTY_STATE;
      }
      const modes: DropdownSelectionModes = {};
      if (record.modes !== null && typeof record.modes === 'object' && !Array.isArray(record.modes)) {
        for (const [columnId, mode] of Object.entries(record.modes as Record<string, unknown>)) {
          if (mode === 'OR' || mode === 'AND') modes[columnId] = mode;
        }
      }
      return { selections: parseSelectionsRecord(record.selections as Record<string, unknown>), modes };
    }
    // Legacy bare-selections shape, written before per-dropdown modes
    // existed. Master compiled every multi-pick override as OR, so stamp
    // those columns explicitly — otherwise the preset-inheritance default
    // would silently flip an existing user's stored union to intersection.
    const selections = parseSelectionsRecord(record);
    const modes: DropdownSelectionModes = {};
    for (const [columnId, ids] of Object.entries(selections)) {
      if (ids.length > 1) modes[columnId] = 'OR';
    }
    return { selections, modes };
  } catch {
    return EMPTY_STATE;
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

/**
 * The combinator the dropdown displays and applies: the user's stored choice,
 * else — for a multi-value preset — the block filter's own combinator for the
 * column (missing = AND, the filter format's default), else union: checking
 * several options in a checklist intuitively means "any of these".
 */
export function effectiveDropdownMode(
  modes: DropdownSelectionModes,
  columnId: string,
  filterDefaults: string[],
  baseModesByColumn: Record<string, FilterMode>
): DropdownSelectionMode {
  const stored = modes[columnId];
  if (stored) return stored;
  if (filterDefaults.length > 1) {
    // Mode keys and the dropdown's column id arrive in dashed and dashless
    // forms from different sources; a raw lookup would silently read a
    // persisted OR preset as AND.
    const baseMode = Object.entries(baseModesByColumn).find(([key]) => ID.equals(key, columnId))?.[1];
    return baseMode === 'OR' ? 'OR' : 'AND';
  }
  return 'OR';
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
  dropdownColumnIds: string[],
  selectionModes: DropdownSelectionModes = {}
): { filterState: Filter[]; modesByColumn: Record<string, FilterMode> } {
  const overriddenColumns = dropdownColumnIds.filter(columnId => {
    if (selections[columnId] !== undefined) return true;
    // A stored Any/All choice alone overrides too, when the preset has 2+
    // values to combine — otherwise clicking the toggle without touching a
    // checkbox would be a permanent no-op on the rows while the control
    // displays (and persists) the choice.
    return selectionModes[columnId] !== undefined && filterDefaultsForColumn(filterState, columnId).length > 1;
  });
  if (overriddenColumns.length === 0) return { filterState, modesByColumn };

  const nextFilters = filterState.filter(
    f => !overriddenColumns.some(columnId => ID.equals(f.columnId, columnId) && !isBacklinkFilter(f))
  );
  const nextModes: Record<string, FilterMode> = { ...modesByColumn };

  for (const columnId of overriddenColumns) {
    const baseForColumn = filterState.filter(f => ID.equals(f.columnId, columnId) && !isBacklinkFilter(f));
    const template = baseForColumn[0];
    const selectedIds = selections[columnId] ?? baseForColumn.map(f => f.value);
    for (const entityId of selectedIds) {
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
    if (selectedIds.length > 1) {
      nextModes[columnId] = effectiveDropdownMode(
        selectionModes,
        columnId,
        filterDefaultsForColumn(filterState, columnId),
        modesByColumn
      );
    } else {
      // With a single selection the forward group's mode is irrelevant.
      // Backlink filters live in their own logical group (filterGroupKey)
      // and never read this entry, so deleting is always safe.
      delete nextModes[columnId];
    }
  }

  return { filterState: nextFilters, modesByColumn: nextModes };
}
