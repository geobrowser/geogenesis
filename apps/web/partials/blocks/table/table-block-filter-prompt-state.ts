import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import equal from 'fast-deep-equal';

import { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { ID } from '~/core/id';
import { FilterableValueType } from '~/core/value-types';

/**
 * Draft state for the data block filter popover.
 *
 * Kept apart from the popover component because it is plain data: the popover, the filter
 * chips and the tests all reason about "what would be applied right now" without touching
 * React, the sync engine, or search.
 */

export type TableBlockNewFilterRow = {
  columnId: string;
  value: string;
  valueType: FilterableValueType;
  valueName: string | null;
  columnName: string;
};

export type InterfaceFilterValue =
  | { type: 'string'; value: string }
  | {
      type: 'entity';
      entityId: string;
      entityName: string | null;
    }
  | { type: 'space'; spaceId: string; spaceName: string | null };

export function getFilterValue(interfaceFilterValue: InterfaceFilterValue) {
  switch (interfaceFilterValue.type) {
    case 'string':
      return interfaceFilterValue.value;
    case 'entity':
      return interfaceFilterValue.entityId;
    case 'space':
      return interfaceFilterValue.spaceId;
  }
}

export type FilterColumnDraft = {
  multiEntitySelections: { id: string; name: string | null }[];
  multiSpaceSelections: { id: string; name: string | null }[];
  multiStringSelections: string[];
  textInput: string;
};

export function emptyColumnDraft(): FilterColumnDraft {
  return {
    multiEntitySelections: [],
    multiSpaceSelections: [],
    multiStringSelections: [],
    textInput: '',
  };
}

export function cloneColumnDraft(draft: FilterColumnDraft): FilterColumnDraft {
  return {
    multiEntitySelections: draft.multiEntitySelections.map(e => ({ ...e })),
    multiSpaceSelections: draft.multiSpaceSelections.map(s => ({ ...s })),
    multiStringSelections: [...draft.multiStringSelections],
    textInput: draft.textInput,
  };
}

export function cloneColumnDraftsRecord(drafts: Record<string, FilterColumnDraft>): Record<string, FilterColumnDraft> {
  return Object.fromEntries(Object.entries(drafts).map(([columnId, draft]) => [columnId, cloneColumnDraft(draft)]));
}

export function buildSessionBaselineFromCommittedFilters(
  options: (Filter & { columnName: string })[],
  filters: Filter[]
): Record<string, FilterColumnDraft> {
  const baseline: Record<string, FilterColumnDraft> = {};
  for (const o of options) {
    baseline[o.columnId] = seedColumnDraftFromCommittedFilters(o.columnId, filters, options);
  }
  return cloneColumnDraftsRecord(baseline);
}

export function snapshotColumnDraft(state: PromptState): FilterColumnDraft {
  return {
    multiEntitySelections: state.multiEntitySelections.map(e => ({ ...e })),
    multiSpaceSelections: state.multiSpaceSelections.map(s => ({ ...s })),
    multiStringSelections: [...state.multiStringSelections],
    textInput: state.value.type === 'string' ? state.value.value : '',
  };
}

export function applyColumnDraft(
  draft: FilterColumnDraft
): Pick<PromptState, 'multiEntitySelections' | 'multiSpaceSelections' | 'multiStringSelections' | 'value'> {
  return {
    multiEntitySelections: draft.multiEntitySelections.map(e => ({ ...e })),
    multiSpaceSelections: draft.multiSpaceSelections.map(s => ({ ...s })),
    multiStringSelections: [...draft.multiStringSelections],
    value: { type: 'string', value: draft.textInput },
  };
}

export function removeStringFromDraft(draft: FilterColumnDraft, value: string): FilterColumnDraft {
  const typed = draft.textInput.trim();
  const inMulti = draft.multiStringSelections.includes(value);
  let multiStringSelections = draft.multiStringSelections;
  let textInput = draft.textInput;
  if (inMulti) {
    multiStringSelections = draft.multiStringSelections.filter(s => s !== value);
  } else if (typed === value) {
    textInput = '';
  }
  return { ...draft, multiStringSelections, textInput };
}

export type PromptState = {
  selectedColumn: string;
  value: InterfaceFilterValue;
  multiEntitySelections: { id: string; name: string | null }[];
  multiSpaceSelections: { id: string; name: string | null }[];
  multiStringSelections: string[];
  columnDrafts: Record<string, FilterColumnDraft>;
  /** Snapshot of table filters when the popover opened; header Clear all restores this. */
  sessionBaseline: Record<string, FilterColumnDraft>;
  open: boolean;
};

export type PromptAction =
  | {
      type: 'open';
    }
  | { type: 'close' }
  | { type: 'onOpenChange'; payload: { open: boolean } }
  | { type: 'selectColumn'; payload: { columnId: string; seedDraft?: FilterColumnDraft } }
  | {
      type: 'openWithColumn';
      payload: { columnId: string; seedDraft?: FilterColumnDraft; sessionBaseline?: Record<string, FilterColumnDraft> };
    }
  | {
      type: 'selectEntityValue' | 'selectSpaceValue';
      payload: { id: string; name: string | null };
    }
  | {
      type: 'toggleEntitySelection' | 'toggleSpaceSelection';
      payload: { id: string; name: string | null };
    }
  | { type: 'toggleStringSelection'; payload: { value: string } }
  | {
      type: 'selectStringValue';
      payload: { value: string };
    }
  | {
      type: 'toggleEntitySelectionForColumn';
      payload: { columnId: string; id: string; name: string | null };
    }
  | {
      type: 'toggleSpaceSelectionForColumn';
      payload: { columnId: string; id: string; name: string | null };
    }
  | { type: 'removeStringFromColumnDraft'; payload: { columnId: string; value: string } }
  | { type: 'clearCurrentColumnSelections' }
  | { type: 'clearAllColumnDrafts' }
  | { type: 'restorePopoverSessionBaseline' }
  | {
      type: 'commitEntitySelections';
      payload: { selections: { id: string; name: string | null }[] };
    }
  | {
      type: 'commitSpaceSelections';
      payload: { selections: { id: string; name: string | null }[] };
    }
  | {
      type: 'done';
    }
  | {
      type: 'reset';
      payload?: {
        source?: Source;
        open?: boolean;
        seedDraft?: FilterColumnDraft;
        sessionBaseline?: Record<string, FilterColumnDraft>;
      };
    };

export const emptyMulti = {
  multiEntitySelections: [] as { id: string; name: string | null }[],
  multiSpaceSelections: [] as { id: string; name: string | null }[],
  multiStringSelections: [] as string[],
};

export const emptyDrafts = () => ({}) as Record<string, FilterColumnDraft>;

export function normalizePromptState(s: PromptState): PromptState {
  return {
    ...s,
    columnDrafts: s.columnDrafts ?? emptyDrafts(),
    sessionBaseline: s.sessionBaseline ?? emptyDrafts(),
    multiEntitySelections: s.multiEntitySelections ?? [],
    multiSpaceSelections: s.multiSpaceSelections ?? [],
    multiStringSelections: s.multiStringSelections ?? [],
  };
}

export const reducer = (rawState: PromptState, action: PromptAction): PromptState => {
  const state = normalizePromptState(rawState);
  switch (action.type) {
    case 'open':
      return {
        ...state,
        open: true,
      };
    case 'close':
      return {
        ...state,
        open: false,
      };
    case 'onOpenChange':
      return {
        ...state,
        open: action.payload.open,
      };
    case 'selectColumn': {
      const prevCol = state.selectedColumn;
      const nextCol = action.payload.columnId;
      if (prevCol === nextCol) return state;

      const savedPrev = snapshotColumnDraft(state);
      const loaded = action.payload.seedDraft ?? state.columnDrafts[nextCol] ?? emptyColumnDraft();
      return {
        ...state,
        selectedColumn: nextCol,
        ...applyColumnDraft(loaded),
        columnDrafts: {
          ...state.columnDrafts,
          [prevCol]: savedPrev,
          [nextCol]: loaded,
        },
      };
    }
    case 'openWithColumn': {
      const prevCol = state.selectedColumn;
      const nextCol = action.payload.columnId;
      const savedPrev = snapshotColumnDraft(state);
      const stored = state.columnDrafts[nextCol] ?? emptyColumnDraft();
      const loaded = action.payload.seedDraft ?? stored;
      const sessionBaseline =
        action.payload.sessionBaseline != null
          ? cloneColumnDraftsRecord(action.payload.sessionBaseline)
          : state.sessionBaseline;
      return {
        ...state,
        open: true,
        selectedColumn: nextCol,
        ...applyColumnDraft(loaded),
        columnDrafts: {
          ...state.columnDrafts,
          [prevCol]: savedPrev,
          [nextCol]: loaded,
        },
        sessionBaseline,
      };
    }
    case 'selectEntityValue':
      return {
        ...state,
        value: {
          type: 'entity',
          entityId: action.payload.id,
          entityName: action.payload.name,
        },
      };
    case 'selectSpaceValue':
      return {
        ...state,
        value: {
          type: 'space',
          spaceId: action.payload.id,
          spaceName: action.payload.name,
        },
      };
    case 'toggleEntitySelection': {
      const { id, name } = action.payload;
      const exists = state.multiEntitySelections.some(e => e.id === id);
      return {
        ...state,
        multiEntitySelections: exists
          ? state.multiEntitySelections.filter(e => e.id !== id)
          : [...state.multiEntitySelections, { id, name }],
      };
    }
    case 'toggleSpaceSelection': {
      const { id, name } = action.payload;
      const exists = state.multiSpaceSelections.some(s => s.id === id);
      return {
        ...state,
        multiSpaceSelections: exists
          ? state.multiSpaceSelections.filter(s => s.id !== id)
          : [...state.multiSpaceSelections, { id, name }],
      };
    }
    case 'toggleStringSelection': {
      const v = action.payload.value;
      const exists = state.multiStringSelections.includes(v);
      return {
        ...state,
        multiStringSelections: exists
          ? state.multiStringSelections.filter(s => s !== v)
          : [...state.multiStringSelections, v],
      };
    }
    case 'selectStringValue':
      return {
        ...state,
        value: {
          type: 'string',
          value: action.payload.value,
        },
      };
    case 'toggleEntitySelectionForColumn': {
      const { columnId, id, name } = action.payload;
      if (columnId === state.selectedColumn) {
        const exists = state.multiEntitySelections.some(e => e.id === id);
        return {
          ...state,
          multiEntitySelections: exists
            ? state.multiEntitySelections.filter(e => e.id !== id)
            : [...state.multiEntitySelections, { id, name }],
        };
      }
      const prev = state.columnDrafts[columnId] ?? emptyColumnDraft();
      const exists = prev.multiEntitySelections.some(e => e.id === id);
      return {
        ...state,
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: {
            ...prev,
            multiEntitySelections: exists
              ? prev.multiEntitySelections.filter(e => e.id !== id)
              : [...prev.multiEntitySelections, { id, name }],
          },
        },
      };
    }
    case 'toggleSpaceSelectionForColumn': {
      const { columnId, id, name } = action.payload;
      if (columnId === state.selectedColumn) {
        const exists = state.multiSpaceSelections.some(s => s.id === id);
        return {
          ...state,
          multiSpaceSelections: exists
            ? state.multiSpaceSelections.filter(s => s.id !== id)
            : [...state.multiSpaceSelections, { id, name }],
        };
      }
      const prev = state.columnDrafts[columnId] ?? emptyColumnDraft();
      const exists = prev.multiSpaceSelections.some(s => s.id === id);
      return {
        ...state,
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: {
            ...prev,
            multiSpaceSelections: exists
              ? prev.multiSpaceSelections.filter(s => s.id !== id)
              : [...prev.multiSpaceSelections, { id, name }],
          },
        },
      };
    }
    case 'removeStringFromColumnDraft': {
      const { columnId, value } = action.payload;
      if (columnId === state.selectedColumn) {
        const next = removeStringFromDraft(snapshotColumnDraft(state), value);
        return {
          ...state,
          ...applyColumnDraft(next),
        };
      }
      const prev = state.columnDrafts[columnId] ?? emptyColumnDraft();
      return {
        ...state,
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: removeStringFromDraft(prev, value),
        },
      };
    }
    case 'clearCurrentColumnSelections': {
      const columnId = state.selectedColumn;
      const empty = emptyColumnDraft();
      return {
        ...state,
        ...applyColumnDraft(empty),
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: empty,
        },
      };
    }
    case 'clearAllColumnDrafts': {
      const empty = emptyColumnDraft();
      return {
        ...state,
        ...applyColumnDraft(empty),
        columnDrafts: emptyDrafts(),
      };
    }
    case 'restorePopoverSessionBaseline': {
      const baseline = cloneColumnDraftsRecord(state.sessionBaseline);
      const columnId = state.selectedColumn;
      const loaded = baseline[columnId] ?? emptyColumnDraft();
      return {
        ...state,
        ...applyColumnDraft(loaded),
        columnDrafts: baseline,
      };
    }
    case 'commitEntitySelections': {
      const columnId = state.selectedColumn;
      const selections = action.payload.selections.map(e => ({ ...e }));
      const draft = {
        ...(state.columnDrafts[columnId] ?? emptyColumnDraft()),
        multiEntitySelections: selections,
      };
      return {
        ...state,
        multiEntitySelections: selections,
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: draft,
        },
      };
    }
    case 'commitSpaceSelections': {
      const columnId = state.selectedColumn;
      const selections = action.payload.selections.map(s => ({ ...s }));
      const draft = {
        ...(state.columnDrafts[columnId] ?? emptyColumnDraft()),
        multiSpaceSelections: selections,
      };
      return {
        ...state,
        multiSpaceSelections: selections,
        columnDrafts: {
          ...state.columnDrafts,
          [columnId]: draft,
        },
      };
    }
    case 'done':
      return {
        open: false,
        selectedColumn: SystemIds.NAME_PROPERTY,
        value: {
          type: 'string',
          value: '',
        },
        ...emptyMulti,
        columnDrafts: emptyDrafts(),
        sessionBaseline: emptyDrafts(),
      };
    case 'reset': {
      const next = getInitialState(action.payload?.source ?? { type: 'GEO' });
      const loaded = action.payload?.seedDraft ?? snapshotColumnDraft(next);
      const sessionBaseline = action.payload?.sessionBaseline
        ? cloneColumnDraftsRecord(action.payload.sessionBaseline)
        : next.sessionBaseline;
      return {
        ...next,
        ...applyColumnDraft(loaded),
        columnDrafts: {
          ...next.columnDrafts,
          [next.selectedColumn]: loaded,
        },
        sessionBaseline,
        open: action.payload?.open ?? state.open,
      };
    }
  }
};

export function getInitialState(source: Source): PromptState {
  if (source.type === 'RELATIONS') {
    return {
      selectedColumn: SystemIds.RELATION_TYPE_PROPERTY,
      value: {
        type: 'entity',
        entityId: source.value,
        entityName: null,
      },
      ...emptyMulti,
      columnDrafts: emptyDrafts(),
      sessionBaseline: emptyDrafts(),
      open: false,
    };
  }

  return {
    selectedColumn: SystemIds.NAME_PROPERTY,
    value: {
      type: 'string',
      value: '',
    },
    ...emptyMulti,
    columnDrafts: emptyDrafts(),
    sessionBaseline: emptyDrafts(),
    open: false,
  };
}

export function getEffectiveColumnDraft(state: PromptState, columnId: string): FilterColumnDraft {
  const normalized = normalizePromptState(state);
  if (columnId === normalized.selectedColumn) {
    return snapshotColumnDraft(normalized);
  }
  return normalized.columnDrafts[columnId] ?? normalized.sessionBaseline[columnId] ?? emptyColumnDraft();
}

/** Merged drafts for all columns touched in this popover session (includes session baseline for untouched columns). */
export function mergeAllColumnDrafts(state: PromptState): Record<string, FilterColumnDraft> {
  const normalized = normalizePromptState(state);
  const columnIds = new Set<string>([
    ...Object.keys(normalized.columnDrafts),
    ...Object.keys(normalized.sessionBaseline),
    normalized.selectedColumn,
  ]);
  const merged: Record<string, FilterColumnDraft> = {};
  for (const columnId of columnIds) {
    merged[columnId] = getEffectiveColumnDraft(normalized, columnId);
  }
  return merged;
}

export function draftHasPending(
  draft: FilterColumnDraft,
  columnId: string,
  options: (Filter & { columnName: string })[]
): boolean {
  const selectedOption = options.find(o => ID.equals(o.columnId, columnId));
  if (selectedOption?.valueType === 'RELATION') {
    return draft.multiEntitySelections.length > 0;
  }
  if (ID.equals(columnId, SystemIds.SPACE_FILTER)) {
    return draft.multiSpaceSelections.length > 0;
  }
  if (selectedOption?.valueType === 'TEXT') {
    return draft.multiStringSelections.length > 0 || draft.textInput.trim() !== '';
  }
  return false;
}

export function columnDraftMatchesCommitted(
  draft: FilterColumnDraft,
  committed: FilterColumnDraft,
  columnId: string,
  options: (Filter & { columnName: string })[]
): boolean {
  const selectedOption = options.find(o => ID.equals(o.columnId, columnId));
  if (selectedOption?.valueType === 'RELATION') {
    const a = new Set(draft.multiEntitySelections.map(e => e.id));
    const b = new Set(committed.multiEntitySelections.map(e => e.id));
    return a.size === b.size && [...a].every(id => b.has(id));
  }
  if (ID.equals(columnId, SystemIds.SPACE_FILTER)) {
    const a = new Set(draft.multiSpaceSelections.map(s => s.id));
    const b = new Set(committed.multiSpaceSelections.map(s => s.id));
    return a.size === b.size && [...a].every(id => b.has(id));
  }
  if (selectedOption?.valueType === 'TEXT') {
    const norm = (d: FilterColumnDraft) => {
      const vals = new Set(d.multiStringSelections);
      const t = d.textInput.trim();
      if (t) vals.add(t);
      return vals;
    };
    const x = norm(draft);
    const y = norm(committed);
    return x.size === y.size && [...x].every(v => y.has(v));
  }
  return equal(draft, committed);
}

export function hasPendingFilterSelections(state: PromptState, options: (Filter & { columnName: string })[]): boolean {
  const merged = mergeAllColumnDrafts(normalizePromptState(state));
  return Object.keys(merged).some(columnId => {
    const d = merged[columnId];
    return d != null && draftHasPending(d, columnId, options);
  });
}

export function hasAnyFilterDraftSelections(state: PromptState): boolean {
  const normalized = normalizePromptState(state);
  if (
    normalized.multiEntitySelections.length > 0 ||
    normalized.multiSpaceSelections.length > 0 ||
    normalized.multiStringSelections.length > 0
  ) {
    return true;
  }
  return Object.values(normalized.columnDrafts).some(
    draft =>
      draft.multiEntitySelections.length > 0 ||
      draft.multiSpaceSelections.length > 0 ||
      draft.multiStringSelections.length > 0
  );
}

export function popoverDraftsDifferFromSessionBaseline(
  state: PromptState,
  options: (Filter & { columnName: string })[]
): boolean {
  const normalized = normalizePromptState(state);
  const merged = mergeAllColumnDrafts(normalized);
  for (const o of options) {
    const columnId = o.columnId;
    const draft = merged[columnId] ?? emptyColumnDraft();
    const baseline = normalized.sessionBaseline[columnId] ?? emptyColumnDraft();
    if (!columnDraftMatchesCommitted(draft, baseline, columnId, options)) {
      return true;
    }
  }
  return false;
}

/** When local column drafts are empty (e.g. after Done), rebuild chips from committed table filters. */
export function seedColumnDraftFromCommittedFilters(
  columnId: string,
  filters: Filter[],
  options: (Filter & { columnName: string })[]
): FilterColumnDraft {
  const draft = emptyColumnDraft();
  const selectedOption = options.find(o => ID.equals(o.columnId, columnId));
  const matching = filters.filter(f => ID.equals(f.columnId, columnId));

  if (selectedOption?.valueType === 'RELATION') {
    for (const f of matching) {
      draft.multiEntitySelections.push({
        id: f.value,
        name: f.valueName,
      });
    }
  } else if (ID.equals(columnId, SystemIds.SPACE_FILTER)) {
    for (const f of matching) {
      draft.multiSpaceSelections.push({ id: f.value, name: f.valueName });
    }
  } else if (selectedOption?.valueType === 'TEXT') {
    for (const f of matching) {
      if (!draft.multiStringSelections.includes(f.value)) {
        draft.multiStringSelections.push(f.value);
      }
    }
  }

  return draft;
}

export function rowsFromColumnDraft(
  columnId: string,
  draft: FilterColumnDraft,
  options: (Filter & { columnName: string })[]
): TableBlockNewFilterRow[] {
  const selectedOption = options.find(o => ID.equals(o.columnId, columnId));
  const columnName = selectedOption?.columnName ?? '';
  const rows: TableBlockNewFilterRow[] = [];

  if (selectedOption?.valueType === 'RELATION') {
    for (const e of draft.multiEntitySelections) {
      rows.push({
        columnId,
        value: e.id,
        valueName: e.name,
        valueType: 'RELATION',
        columnName,
      });
    }
  } else if (ID.equals(columnId, SystemIds.SPACE_FILTER)) {
    for (const s of draft.multiSpaceSelections) {
      rows.push({
        columnId,
        value: s.id,
        valueName: s.name,
        valueType: 'RELATION',
        columnName: columnName || 'Space',
      });
    }
  } else if (selectedOption?.valueType === 'TEXT') {
    const typed = draft.textInput.trim();
    const mergedVals = new Set(draft.multiStringSelections);
    if (typed) mergedVals.add(typed);
    for (const v of mergedVals) {
      rows.push({
        columnId,
        value: v,
        valueName: v,
        valueType: 'TEXT',
        columnName,
      });
    }
  }

  return rows;
}

/** Applies all columns whose drafts differ from the session baseline (including cleared columns). */
/**
 * The payload a commit sends to the table, whether that commit came from Done or from
 * dismissing the popover. Columns whose draft still matches the session baseline are left
 * out entirely, so an open-and-dismiss with no edits changes nothing.
 */
export function collectFiltersToApply(
  state: PromptState,
  options: (Filter & { columnName: string })[]
): { filters: TableBlockNewFilterRow[]; touchedColumnIds: string[] } {
  const normalized = normalizePromptState(state);
  const merged = mergeAllColumnDrafts(normalized);
  const filters: TableBlockNewFilterRow[] = [];
  const touchedColumnIds: string[] = [];

  for (const o of options) {
    const columnId = o.columnId;
    const draft = merged[columnId] ?? emptyColumnDraft();
    const baseline = normalized.sessionBaseline[columnId] ?? emptyColumnDraft();
    if (columnDraftMatchesCommitted(draft, baseline, columnId, options)) continue;

    touchedColumnIds.push(columnId);
    filters.push(...rowsFromColumnDraft(columnId, draft, options));
  }

  return { filters, touchedColumnIds };
}

export type PendingFilterChipItem =
  | {
      key: string;
      columnId: string;
      columnName: string;
      kind: 'entity';
      id: string;
      name: string | null;
    }
  | {
      key: string;
      columnId: string;
      columnName: string;
      kind: 'space';
      id: string;
      name: string | null;
    }
  | {
      key: string;
      columnId: string;
      columnName: string;
      kind: 'string';
      value: string;
    };

export function enumeratePendingFilterChips(
  state: PromptState,
  options: (Filter & { columnName: string })[]
): PendingFilterChipItem[] {
  const merged = mergeAllColumnDrafts(normalizePromptState(state));
  const columnIds = Object.keys(merged).filter(columnId => {
    const d = merged[columnId];
    return d != null && draftHasPending(d, columnId, options);
  });
  columnIds.sort((a, b) => {
    const nameA = options.find(o => o.columnId === a)?.columnName ?? (a === SystemIds.SPACE_FILTER ? 'Space' : a);
    const nameB = options.find(o => o.columnId === b)?.columnName ?? (b === SystemIds.SPACE_FILTER ? 'Space' : b);
    return nameA.localeCompare(nameB);
  });

  const items: PendingFilterChipItem[] = [];

  for (const columnId of columnIds) {
    const draft = merged[columnId];
    if (!draft) continue;

    const opt = options.find(o => o.columnId === columnId);
    const columnName = opt?.columnName ?? (columnId === SystemIds.SPACE_FILTER ? 'Space' : columnId);

    if (opt?.valueType === 'RELATION') {
      for (const e of draft.multiEntitySelections) {
        items.push({
          key: `${columnId}:e:${e.id}`,
          columnId,
          columnName,
          kind: 'entity',
          id: e.id,
          name: e.name,
        });
      }
    } else if (columnId === SystemIds.SPACE_FILTER) {
      for (const s of draft.multiSpaceSelections) {
        items.push({
          key: `${columnId}:s:${s.id}`,
          columnId,
          columnName,
          kind: 'space',
          id: s.id,
          name: s.name,
        });
      }
    } else if (opt?.valueType === 'TEXT') {
      const typed = draft.textInput.trim();
      const mergedVals = new Set(draft.multiStringSelections);
      if (typed) mergedVals.add(typed);
      for (const v of [...mergedVals].sort()) {
        items.push({
          key: `${columnId}:t:${v}`,
          columnId,
          columnName,
          kind: 'string',
          value: v,
        });
      }
    }
  }

  return items;
}

export function pendingChipsNeedFilterMode(items: PendingFilterChipItem[]): boolean {
  const byColumn = new Map<string, number>();
  for (const item of items) {
    byColumn.set(item.columnId, (byColumn.get(item.columnId) ?? 0) + 1);
  }
  return [...byColumn.values()].some(count => count >= 2);
}

/**
 * Fold a commit's rows into an existing filter list, replacing every touched column in
 * place. Shared by the real commit and by the preview the filter chips render from while
 * the popover is still open, so the chips can never disagree with what dismissing applies.
 */
export function mergeFilterRows(
  current: Filter[],
  rows: TableBlockNewFilterRow[],
  touchedColumnIds: string[]
): Filter[] {
  const touched = new Set(touchedColumnIds);
  const base = current.filter(f => !touched.has(f.columnId));
  const replacements = rows.map(row => ({
    valueType: row.valueType,
    columnId: row.columnId,
    columnName: row.columnName,
    value: row.value,
    valueName: row.valueName,
  }));
  const firstTouchedIndex = current.findIndex(f => touched.has(f.columnId));
  const insertIndex = firstTouchedIndex === -1 ? base.length : firstTouchedIndex;
  return [...base.slice(0, insertIndex), ...replacements, ...base.slice(insertIndex)];
}
