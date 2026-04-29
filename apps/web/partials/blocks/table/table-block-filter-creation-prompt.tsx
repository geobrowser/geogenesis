'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from '@xstate/store/react';
import { Duration, Effect } from 'effect';
import equal from 'fast-deep-equal';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';
import { searchResultMatchesAllowedTypes } from '~/core/hooks/use-search';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { getSpacesWhereMember } from '~/core/io/queries';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { E } from '~/core/sync/orm';
import { reactiveRelations } from '~/core/sync/store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import {
  fetchRelationTargetTypeIdsForProperty,
  mergeRelationValueTypesFromStore,
} from '~/core/utils/property/properties';
import { FilterableValueType } from '~/core/value-types';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { ResultItem } from '~/design-system/autocomplete/results-list';
import { Breadcrumb } from '~/design-system/breadcrumb';
import { CloseSmall } from '~/design-system/icons/close-small';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { Divider } from '~/design-system/divider';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Select } from '~/design-system/select';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { TextButton } from '~/design-system/text-button';
import { Toggle } from '~/design-system/toggle';

export interface TableBlockFilterPromptHandle {
  openWithColumn: (columnId: string) => void;
}

export type TableBlockNewFilterRow = {
  columnId: string;
  value: string;
  valueType: FilterableValueType;
  valueName: string | null;
  columnName: string;
};

interface TableBlockFilterPromptProps {
  trigger: React.ReactNode;
  options: (Filter & { columnName: string })[];
  filterSuggestionSpaceId?: string;
  onCreate: (filters: TableBlockNewFilterRow[]) => void;
}

const FILTER_DROPDOWN_PAGE_SIZE = 25;

function useFilterValueInputFocus(filterInteractionRootRef?: React.RefObject<HTMLElement | null>) {
  const [focused, setFocused] = React.useState(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = React.useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, []);

  // Dismiss the dropdown when the user clicks anywhere outside the
  // filter's interaction root — including non-focusable targets like
  // plain text, which don't fire a blur event on the input and would
  // otherwise leave the dropdown lingering after clicking away.
  React.useEffect(() => {
    if (!focused) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && filterInteractionRootRef?.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('[data-radix-select-content]')) {
        return;
      }
      clearBlurTimeout();
      setFocused(false);
      // Also drop DOM focus from the input. Without this the caret stays
      // visible in the input after clicking out, and re-clicking the
      // input doesn't refire onFocus (the browser already considers it
      // focused) so the dropdown wouldn't reopen.
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        filterInteractionRootRef?.current?.contains(active)
      ) {
        active.blur();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [focused, filterInteractionRootRef, clearBlurTimeout]);

  const onFocus = React.useCallback(() => {
    clearBlurTimeout();
    setFocused(true);
  }, [clearBlurTimeout]);

  const onBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const next = e.relatedTarget;
      if (next instanceof Node && filterInteractionRootRef?.current?.contains(next)) {
        return;
      }
      clearBlurTimeout();
      blurTimeoutRef.current = setTimeout(() => {
        blurTimeoutRef.current = null;
        const ae = document.activeElement;
        if (ae instanceof Node && filterInteractionRootRef?.current?.contains(ae)) {
          return;
        }
        if (ae?.closest?.('[data-radix-select-content]')) {
          return;
        }
        setFocused(false);
      }, 120);
    },
    [clearBlurTimeout, filterInteractionRootRef]
  );

  return { focused, setFocused, onFocus, onBlur, clearBlurTimeout };
}

function useRelationColumnTargetTypeIds(
  propertyId: string | undefined,
  blockSpaceId: string | undefined,
  relationValueTypesFromOptions: { id: string; name: string | null }[] | undefined
): { typeIds: string[] | undefined; waitForFilterTypes: boolean } {
  const { store } = useSyncEngine();
  const relationsSnapshot = useSelector(reactiveRelations, r => r, equal);

  const fromStore = React.useMemo(() => {
    void relationsSnapshot;
    if (!propertyId) return undefined;
    const merged = mergeRelationValueTypesFromStore(
      { id: propertyId, name: null, dataType: 'RELATION' },
      store
    );
    return merged.relationValueTypes?.length
      ? merged.relationValueTypes.map(t => t.id)
      : undefined;
  }, [propertyId, relationsSnapshot, store]);

  const {
    data: fromNetwork,
    isFetching: isFetchingNetworkTypes,
    isPending: isPendingNetworkTypes,
  } = useQuery({
    enabled: Boolean(propertyId) && !fromStore?.length,
    queryKey: ['table-block-filter-relation-target-type-ids', propertyId, blockSpaceId],
    queryFn: () => fetchRelationTargetTypeIdsForProperty(propertyId!, blockSpaceId),
    staleTime: 60_000,
  });

  const typeIds = React.useMemo(() => {
    const fromOptions = relationValueTypesFromOptions?.length
      ? relationValueTypesFromOptions.map(t => t.id)
      : undefined;
    if (fromStore?.length) return fromStore;
    if (fromNetwork?.length) return fromNetwork;
    return fromOptions;
  }, [fromStore, fromNetwork, relationValueTypesFromOptions]);

  /** Until we have target type ids, do not show unfiltered relation suggestions or run unscoped search. */
  const waitForFilterTypes =
    Boolean(propertyId) &&
    !typeIds?.length &&
    (isFetchingNetworkTypes || isPendingNetworkTypes);

  return { typeIds, waitForFilterTypes };
}

/**
 * We allow users to filter by Name, Space, or any Text or Relation column. We need to support
 * different autocomplete experiences for the filter inputs for each of these cases. Each data
 * model for these cases is also different, and we represent the different cases in the filter UI
 * with the InterfaceFilterValue type below.
 */
type InterfaceFilterValue =
  | { type: 'string'; value: string }
  | {
      type: 'entity';
      entityId: string;
      entityName: string | null;
    }
  | { type: 'space'; spaceId: string; spaceName: string | null };

function getFilterValue(interfaceFilterValue: InterfaceFilterValue) {
  switch (interfaceFilterValue.type) {
    case 'string':
      return interfaceFilterValue.value;
    case 'entity':
      return interfaceFilterValue.entityId;
    case 'space':
      return interfaceFilterValue.spaceId;
  }
}

function getFilterValueName(interfaceFilterValue: InterfaceFilterValue) {
  switch (interfaceFilterValue.type) {
    case 'string':
      return interfaceFilterValue.value;
    case 'entity':
      return interfaceFilterValue.entityName;
    case 'space':
      return interfaceFilterValue.spaceName;
  }
}

type FilterColumnDraft = {
  multiEntitySelections: { id: string; name: string | null }[];
  multiSpaceSelections: { id: string; name: string | null }[];
  multiStringSelections: string[];
  textInput: string;
};

function emptyColumnDraft(): FilterColumnDraft {
  return {
    multiEntitySelections: [],
    multiSpaceSelections: [],
    multiStringSelections: [],
    textInput: '',
  };
}

function snapshotColumnDraft(state: PromptState): FilterColumnDraft {
  return {
    multiEntitySelections: state.multiEntitySelections.map(e => ({ ...e })),
    multiSpaceSelections: state.multiSpaceSelections.map(s => ({ ...s })),
    multiStringSelections: [...state.multiStringSelections],
    textInput: state.value.type === 'string' ? state.value.value : '',
  };
}

function applyColumnDraft(draft: FilterColumnDraft): Pick<
  PromptState,
  'multiEntitySelections' | 'multiSpaceSelections' | 'multiStringSelections' | 'value'
> {
  return {
    multiEntitySelections: draft.multiEntitySelections.map(e => ({ ...e })),
    multiSpaceSelections: draft.multiSpaceSelections.map(s => ({ ...s })),
    multiStringSelections: [...draft.multiStringSelections],
    value: { type: 'string', value: draft.textInput },
  };
}

function removeStringFromDraft(draft: FilterColumnDraft, value: string): FilterColumnDraft {
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

type PromptState = {
  selectedColumn: string;
  value: InterfaceFilterValue;
  multiEntitySelections: { id: string; name: string | null }[];
  multiSpaceSelections: { id: string; name: string | null }[];
  multiStringSelections: string[];
  columnDrafts: Record<string, FilterColumnDraft>;
  open: boolean;
};

type PromptAction =
  | {
      type: 'open';
    }
  | { type: 'close' }
  | { type: 'onOpenChange'; payload: { open: boolean } }
  | { type: 'selectColumn'; payload: { columnId: string } }
  | { type: 'openWithColumn'; payload: { columnId: string } }
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
  | {
      type: 'done';
    }
  | {
      type: 'reset';
    };

const emptyMulti = {
  multiEntitySelections: [] as { id: string; name: string | null }[],
  multiSpaceSelections: [] as { id: string; name: string | null }[],
  multiStringSelections: [] as string[],
};

const emptyDrafts = () => ({}) as Record<string, FilterColumnDraft>;

function normalizePromptState(s: PromptState): PromptState {
  return {
    ...s,
    columnDrafts: s.columnDrafts ?? emptyDrafts(),
    multiEntitySelections: s.multiEntitySelections ?? [],
    multiSpaceSelections: s.multiSpaceSelections ?? [],
    multiStringSelections: s.multiStringSelections ?? [],
  };
}

const reducer = (rawState: PromptState, action: PromptAction): PromptState => {
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
      const loaded = state.columnDrafts[nextCol] ?? emptyColumnDraft();
      return {
        ...state,
        selectedColumn: nextCol,
        ...applyColumnDraft(loaded),
        columnDrafts: {
          ...state.columnDrafts,
          [prevCol]: savedPrev,
        },
      };
    }
    case 'openWithColumn': {
      const prevCol = state.selectedColumn;
      const nextCol = action.payload.columnId;
      const savedPrev = snapshotColumnDraft(state);
      const loaded = state.columnDrafts[nextCol] ?? emptyColumnDraft();
      return {
        ...state,
        open: true,
        selectedColumn: nextCol,
        ...applyColumnDraft(loaded),
        columnDrafts: {
          ...state.columnDrafts,
          [prevCol]: savedPrev,
        },
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
      };
    case 'reset':
      return {
        ...state,
        selectedColumn: SystemIds.NAME_PROPERTY,
        value: {
          type: 'string',
          value: '',
        },
        ...emptyMulti,
        columnDrafts: emptyDrafts(),
      };
  }
};

function getInitialState(source: Source): PromptState {
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
    open: false,
  };
}

function mergeAllColumnDrafts(state: PromptState): Record<string, FilterColumnDraft> {
  return {
    ...state.columnDrafts,
    [state.selectedColumn]: snapshotColumnDraft(state),
  };
}

function draftHasPending(
  draft: FilterColumnDraft,
  columnId: string,
  options: (Filter & { columnName: string })[]
): boolean {
  const selectedOption = options.find(o => o.columnId === columnId);
  if (selectedOption?.valueType === 'RELATION') {
    return draft.multiEntitySelections.length > 0;
  }
  if (columnId === SystemIds.SPACE_FILTER) {
    return draft.multiSpaceSelections.length > 0;
  }
  if (selectedOption?.valueType === 'TEXT') {
    return draft.multiStringSelections.length > 0 || draft.textInput.trim() !== '';
  }
  return false;
}

function hasPendingFilterSelections(state: PromptState, options: (Filter & { columnName: string })[]): boolean {
  const merged = mergeAllColumnDrafts(normalizePromptState(state));
  return Object.keys(merged).some(columnId => {
    const d = merged[columnId];
    return d != null && draftHasPending(d, columnId, options);
  });
}

function collectAllPendingFilters(
  state: PromptState,
  options: (Filter & { columnName: string })[]
): TableBlockNewFilterRow[] {
  const merged = mergeAllColumnDrafts(normalizePromptState(state));
  const rows: TableBlockNewFilterRow[] = [];

  for (const [columnId, draft] of Object.entries(merged)) {
    if (!draftHasPending(draft, columnId, options)) continue;

    const selectedOption = options.find(o => o.columnId === columnId);
    const columnName = selectedOption?.columnName ?? '';

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
    } else if (columnId === SystemIds.SPACE_FILTER) {
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
  }

  return rows;
}

type PendingFilterChipItem =
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

function enumeratePendingFilterChips(
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
    const columnName =
      opt?.columnName ?? (columnId === SystemIds.SPACE_FILTER ? 'Space' : columnId);

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

interface ToggleQueryModeProps {
  queryMode: 'ENTITIES' | 'RELATIONS';
  setQueryMode: (value: 'ENTITIES' | 'RELATIONS') => void;
  localSource: Source | null;
}

function ToggleQueryMode({ queryMode, setQueryMode, localSource }: ToggleQueryModeProps) {
  const { filterState, setFilterState } = useFilters();
  const { setSource } = useSource({ filterState, setFilterState });

  const onToggleQueryMode = () => {
    const newQueryMode = queryMode === 'RELATIONS' ? 'ENTITIES' : 'RELATIONS';
    setQueryMode(newQueryMode);

    if (newQueryMode === 'RELATIONS' && localSource && localSource.type === 'RELATIONS') {
      setSource({
        type: 'RELATIONS',
        name: localSource.name,
        value: localSource.value,
      });
      return;
    }

    setSource({
      type: 'GEO',
    });
  };

  return (
    <div className="z-1000 flex items-center gap-1 px-2 pt-2">
      <p>Entities</p>
      <button type="button" onClick={onToggleQueryMode}>
        <Toggle checked={queryMode === 'RELATIONS'} />
      </button>
      <p>Relations</p>
    </div>
  );
}

export const TableBlockFilterPrompt = React.forwardRef<TableBlockFilterPromptHandle, TableBlockFilterPromptProps>(
  function TableBlockFilterPrompt(
    {
      trigger,
      onCreate,
      options,
      filterSuggestionSpaceId,
    },
    ref
  ) {
    const { id: fromId, spaceId } = useEntityStoreInstance();
    const fromName = useName(fromId, spaceId);

    const { filterState, setFilterState } = useFilters();
    const { source } = useSource({ filterState, setFilterState });
    const [state, dispatch] = React.useReducer(reducer, getInitialState(source));
    const [queryMode, setQueryMode] = React.useState<'RELATIONS' | 'ENTITIES'>(
      source.type === 'RELATIONS' ? 'RELATIONS' : 'ENTITIES'
    );

    React.useImperativeHandle(ref, () => ({
      openWithColumn: (columnId: string) => {
        setQueryMode('ENTITIES');
        dispatch({ type: 'openWithColumn', payload: { columnId } });
      },
    }));

    const [from, setFrom] = React.useState<Source | null>({
      type: 'RELATIONS',
      name: fromName,
      value: fromId,
    });
    const [relationType, setRelationType] = React.useState<Filter | null>(
      filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_PROPERTY) ?? null
    );

    const onToggleQueryMode = (newQueryMode: 'RELATIONS' | 'ENTITIES') => {
      if (queryMode === 'RELATIONS') {
        setFrom(null);
        setRelationType(null);
      } else {
        dispatch({ type: 'reset' });
      }

      setQueryMode(newQueryMode);
    };

    const onEntitiesDone = () => {
      const filters = collectAllPendingFilters(state, options);
      if (filters.length === 0) return;
      onCreate(filters);
      dispatch({ type: 'done' });
    };

    const filters =
      queryMode === 'RELATIONS' ? (
        <StaticRelationsFilters
          from={from}
          setFrom={setFrom}
          relationType={relationType}
          setRelationType={setRelationType}
        />
      ) : (
        <DynamicFilters
          options={options}
          state={state}
          dispatch={dispatch}
          filterSuggestionSpaceId={filterSuggestionSpaceId}
        />
      );

    const done =
      queryMode !== 'RELATIONS' ? (
        <AnimatePresence>
          {hasPendingFilterSelections(state, options) && (
            <motion.span
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
            >
              <TextButton color="ctaPrimary" onClick={onEntitiesDone}>
                Done
              </TextButton>
            </motion.span>
          )}
        </AnimatePresence>
      ) : null;

    const onOpenChange = (open: boolean) => dispatch({ type: 'onOpenChange', payload: { open } });

    return (
      <Root open={state.open} onOpenChange={onOpenChange}>
        <Trigger asChild>{trigger}</Trigger>
        <Portal>
          <AnimatePresence>
            {state.open && (
              <Content
                forceMount={true}
                avoidCollisions={true}
                className="z-10 w-[472px] origin-top-left rounded-lg border border-grey-02 bg-white py-2 shadow-lg"
                sideOffset={8}
                align="start"
                onOpenAutoFocus={e => e.preventDefault()}
                onInteractOutside={e => {
                  // Prevent portals from closing
                  const target = e.target as HTMLElement | null;
                  if (target?.closest('[data-radix-select-content]') || target?.closest('[role="listbox"]')) {
                    e.preventDefault();
                  }
                }}
              >
                <div className="flex items-center justify-between px-2 pb-2 text-smallButton text-grey-04">
                  <p>New filter</p>
                  {done}
                </div>
                <Divider type="horizontal" className="bg-grey-04" />
                {source.type !== 'COLLECTION' && (
                  <ToggleQueryMode queryMode={queryMode} setQueryMode={onToggleQueryMode} localSource={from} />
                )}

                <Spacer height={12} />
                {filters}
              </Content>
            )}
          </AnimatePresence>
        </Portal>
      </Root>
    );
  }
);

interface DynamicFiltersProps {
  options: TableBlockFilterPromptProps['options'];
  state: PromptState;
  dispatch: React.Dispatch<PromptAction>;
  filterSuggestionSpaceId?: string;
}

function MultiSelectChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 rounded-sm border border-grey-02 bg-grey-01 py-0.5 pr-0.5 pl-1.5 text-[0.8125rem] text-text">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        className="flex shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text"
        onClick={e => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${label}`}
      >
        <CloseSmall color="grey-04" />
      </button>
    </span>
  );
}

function DynamicFilters({
  options,
  dispatch,
  state,
  filterSuggestionSpaceId,
}: DynamicFiltersProps) {
  const onSelectColumnToFilter = (columnId: string) => dispatch({ type: 'selectColumn', payload: { columnId } });

  const selectedEntityIds = React.useMemo(
    () => new Set(state.multiEntitySelections.map(e => e.id)),
    [state.multiEntitySelections]
  );
  const selectedSpaceIds = React.useMemo(
    () => new Set(state.multiSpaceSelections.map(s => s.id)),
    [state.multiSpaceSelections]
  );

  const selectedOption = options.find(o => o.columnId === state.selectedColumn);

  const isRelationPropertyColumn =
    Boolean(state.selectedColumn) &&
    state.selectedColumn !== SystemIds.SPACE_FILTER &&
    selectedOption?.valueType === 'RELATION';

  const { typeIds: relationTargetTypeIds, waitForFilterTypes: waitForRelationTargetTypes } =
    useRelationColumnTargetTypeIds(
      isRelationPropertyColumn ? state.selectedColumn : undefined,
      filterSuggestionSpaceId,
      selectedOption?.relationValueTypes
    );

  const pendingFilterChips = React.useMemo(
    () => enumeratePendingFilterChips(state, options),
    [state, options]
  );

  return (
    <div className="flex w-full flex-col gap-3 px-2">
      {pendingFilterChips.length > 0 && (
        <div className="w-full rounded-md border border-grey-02 bg-grey-01 px-3 py-2">
          <p className="mb-1.5 text-[0.75rem] text-grey-04">Filters to apply</p>
          <div className="flex flex-wrap gap-1.5">
            {pendingFilterChips.map(item => {
              const valueLabel =
                item.kind === 'string' ? item.value : (item.name ?? item.id);
              return (
                <MultiSelectChip
                  key={item.key}
                  label={`${item.columnName} · ${valueLabel}`}
                  onRemove={() => {
                    if (item.kind === 'entity') {
                      dispatch({
                        type: 'toggleEntitySelectionForColumn',
                        payload: { columnId: item.columnId, id: item.id, name: item.name },
                      });
                    } else if (item.kind === 'space') {
                      dispatch({
                        type: 'toggleSpaceSelectionForColumn',
                        payload: { columnId: item.columnId, id: item.id, name: item.name },
                      });
                    } else {
                      dispatch({
                        type: 'removeStringFromColumnDraft',
                        payload: { columnId: item.columnId, value: item.value },
                      });
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex flex-1">
          <Select
            options={options.map(o => ({ value: o.columnId, label: o.columnName }))}
            value={state.selectedColumn}
            onChange={onSelectColumnToFilter}
          />
        </div>
        <span className="rounded bg-divider px-3 py-[8.5px] text-button">Is</span>
        <div className="relative flex flex-1">
          {state.selectedColumn === SystemIds.SPACE_FILTER ? (
            <TableBlockSpaceFilterInput
              selectedValue=""
              selectedSpaceIds={selectedSpaceIds}
              memberSpaceId={filterSuggestionSpaceId}
              onToggleSpace={s => dispatch({ type: 'toggleSpaceSelection', payload: { id: s.id, name: s.name } })}
            />
          ) : selectedOption?.valueType === 'RELATION' ? (
            <TableBlockEntityFilterInput
              filterByTypes={relationTargetTypeIds}
              waitForFilterTypes={waitForRelationTargetTypes}
              restrictSearchToTypes={Boolean(relationTargetTypeIds?.length)}
              selectedValue=""
              selectedEntityIds={selectedEntityIds}
              onToggleEntity={e =>
                dispatch({ type: 'toggleEntitySelection', payload: { id: e.id, name: e.name } })
              }
            />
          ) : (
            <TableBlockTextFilterInput
              value={getFilterValue(state.value)}
              onChange={v => dispatch({ type: 'selectStringValue', payload: { value: v } })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface StaticRelationsFiltersProps {
  from: Source | null;
  relationType: Filter | null;
  setFrom: (source: Source) => void;
  setRelationType: (relationType: Filter) => void;
}

function StaticRelationsFilters({ from, relationType, setFrom, setRelationType }: StaticRelationsFiltersProps) {
  const { filterState, setFilterState } = useFilters();
  const { setSource } = useSource({ filterState, setFilterState });

  const onSetRelationType = (entity: { id: string; name: string | null }) => {
    setRelationType({
      columnId: SystemIds.RELATION_FROM_PROPERTY,
      columnName: 'From',
      value: entity.id,
      valueName: entity.name,
      valueType: 'RELATION',
    });

    const withoutRelationType = filterState.filter(f => f.columnId !== SystemIds.RELATION_TYPE_PROPERTY);

    setFilterState([
      ...withoutRelationType,
      {
        columnId: SystemIds.RELATION_TYPE_PROPERTY,
        columnName: null,
        value: entity.id,
        valueName: entity.name,
        valueType: 'RELATION',
      },
    ]);
  };

  const onSetSource = (entity: { id: string; name: string | null }) => {
    setFrom({
      type: 'RELATIONS',
      name: entity.name,
      value: entity.id,
    });

    setSource({
      type: 'RELATIONS',
      name: entity.name,
      value: entity.id,
    });
  };

  return (
    <>
      <div className="space-y-2 px-2">
        <div className="flex items-center justify-center gap-2">
          <p className="flex h-9 min-w-28 items-center justify-start rounded bg-divider px-3 text-button">
            Relation type
          </p>
          <TableBlockEntityFilterInput onSelect={onSetRelationType} selectedValue={relationType?.valueName ?? ''} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <p className="flex h-9 min-w-28 items-center justify-start rounded bg-divider px-3 text-button">From</p>
          <TableBlockEntityFilterInput
            onSelect={onSetSource}
            selectedValue={from?.type === 'RELATIONS' ? (from?.name ?? '') : ''}
          />
        </div>
      </div>
    </>
  );
}

interface TableBlockEntityFilterInputProps {
  onSelect?: (result: { id: string; name: string | null }) => void;
  selectedValue: string;
  filterByTypes?: string[];
  waitForFilterTypes?: boolean;
  restrictSearchToTypes?: boolean;
  selectedEntityIds?: Set<string>;
  onToggleEntity?: (result: { id: string; name: string | null }) => void;
  multiSelectPlaceholder?: string;
}

function TableBlockEntityFilterInput({
  onSelect,
  selectedValue,
  filterByTypes,
  waitForFilterTypes = false,
  restrictSearchToTypes = false,
  selectedEntityIds,
  onToggleEntity,
  multiSelectPlaceholder,
}: TableBlockEntityFilterInputProps) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  // Local ref scopes focus tracking to just this input + its dropdown, so
  // clicking a sibling control (e.g. the column-picker Select) dismisses
  // the dropdown instead of keeping it open.
  const interactionRootRef = React.useRef<HTMLDivElement>(null);
  const { focused, setFocused, onFocus, onBlur, clearBlurTimeout } =
    useFilterValueInputFocus(interactionRootRef);

  const [rawQuery, setRawQuery] = React.useState('');
  const query = useDebouncedValue(rawQuery);
  const additionalSpaceIds = useGlobalSearchSpaceIds();

  const searchBlocked =
    (waitForFilterTypes || restrictSearchToTypes) && !filterByTypes?.length;

  // Single unified search path: when the dropdown is open, fire the REST
  // /search endpoint with the current (possibly empty) query and the
  // target-type constraint. Empty query returns top-N globally ranked
  // entities of the target type, typed query returns ranked matches.
  const {
    data: searchPages,
    isPending: isSearchPending,
    isFetching: isSearchFetching,
    isFetchingNextPage: isSearchFetchingNextPage,
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
  } = useInfiniteQuery({
    queryKey: [
      'table-block-filter-search',
      query,
      filterByTypes?.slice().sort().join(',') ?? '',
      additionalSpaceIds,
    ],
    enabled: focused && !searchBlocked,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      // Use the same fuzzy-search path the global search bar uses so the
      // row display (space icon + breadcrumb + type tags + description)
      // matches everywhere. findFuzzyPage returns both the filtered
      // SearchResult rows and the raw REST /search count — we need the
      // raw count for pagination because the post-processing step
      // discards entities whose spaces can't be resolved, which would
      // otherwise shrink a full 25-row page and fool `hasNextPage`.
      const { results, rawCount, total } = await E.findFuzzyPage({
        store,
        cache,
        where: {
          name: { fuzzy: query },
          ...(filterByTypes?.length
            ? { types: filterByTypes.map(id => ({ id: { equals: id } })) }
            : {}),
        },
        first: FILTER_DROPDOWN_PAGE_SIZE,
        skip: pageParam,
        signal,
        additionalSpaceIds,
      });
      return { rows: results, offset: pageParam, rawCount, total };
    },
    getNextPageParam: lastPage => {
      // Use REST `total` when available — it's the authoritative count
      // of matches across the entire result set. Fall back to "did we
      // get a full raw page?" when total is absent.
      const nextOffset = lastPage.offset + FILTER_DROPDOWN_PAGE_SIZE;
      if (typeof lastPage.total === 'number') {
        return nextOffset >= lastPage.total ? undefined : nextOffset;
      }
      return lastPage.rawCount < FILTER_DROPDOWN_PAGE_SIZE ? undefined : nextOffset;
    },
    staleTime: Duration.toMillis(Duration.seconds(60)),
  });

  const searchResults = React.useMemo(
    () => searchPages?.pages.flatMap(p => p.rows) ?? [],
    [searchPages]
  );

  const rowsToRender = React.useMemo(
    () =>
      searchResults
        .filter(r => {
          if (restrictSearchToTypes && !filterByTypes?.length) return false;
          return searchResultMatchesAllowedTypes(r, filterByTypes);
        })
        .map(r => ({ kind: 'search' as const, result: r })),
    [searchResults, filterByTypes, restrictSearchToTypes]
  );

  const filterByTypesKey = filterByTypes?.slice().sort().join(',') ?? '';
  const [entityVisibleCount, setEntityVisibleCount] = React.useState(FILTER_DROPDOWN_PAGE_SIZE);
  React.useEffect(() => {
    setEntityVisibleCount(FILTER_DROPDOWN_PAGE_SIZE);
  }, [query, filterByTypesKey]);

  const visibleEntityRows = React.useMemo(
    () => rowsToRender.slice(0, entityVisibleCount),
    [rowsToRender, entityVisibleCount]
  );

  const entityResultsListRef = React.useRef<HTMLUListElement>(null);

  const expandVisibleEntityRowsIfListHasNoScrollbar = React.useCallback(() => {
    const el = entityResultsListRef.current;
    if (!el) return;
    const noOverflow = el.scrollHeight <= el.clientHeight + 2;
    if (!noOverflow) return;
    if (entityVisibleCount < rowsToRender.length) {
      setEntityVisibleCount(c => Math.min(c + FILTER_DROPDOWN_PAGE_SIZE, rowsToRender.length));
    }
  }, [entityVisibleCount, rowsToRender.length]);

  const handleEntityResultsScroll = React.useCallback(
    (e: React.UIEvent<HTMLUListElement>) => {
      const el = e.currentTarget;
      // ~2 result-row heights of early prefetch on top of the baseline.
      const threshold = 275;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const noOverflow = el.scrollHeight <= el.clientHeight + 2;
      const nearBottom = distanceFromBottom <= threshold;
      if (!nearBottom && !noOverflow) return;
      if (entityVisibleCount < rowsToRender.length) {
        setEntityVisibleCount(c => Math.min(c + FILTER_DROPDOWN_PAGE_SIZE, rowsToRender.length));
        return;
      }
      if (hasNextSearchPage && !isSearchFetchingNextPage) {
        void fetchNextSearchPage();
      }
    },
    [entityVisibleCount, rowsToRender.length, hasNextSearchPage, isSearchFetchingNextPage, fetchNextSearchPage]
  );

  const showEmptyHint =
    !searchBlocked &&
    searchResults.length === 0 &&
    !isSearchFetching &&
    !isSearchPending;

  const showDropdown =
    focused && (rowsToRender.length > 0 || isSearchPending || isSearchFetching || showEmptyHint);

  React.useLayoutEffect(() => {
    if (!showDropdown) return;
    expandVisibleEntityRowsIfListHasNoScrollbar();
  }, [showDropdown, expandVisibleEntityRowsIfListHasNoScrollbar, searchResults.length, rowsToRender.length, entityVisibleCount]);

  // Pull pages until either (a) the dropdown has a full page of rows, or
  // (b) the REST endpoint returned a full raw page but every row got
  // dropped by findFuzzyPage's space-resolution filter. Case (b)
  // specifically signals "we're in a sparse run mid-result-set" rather
  // than "we've hit the tail" — a partial raw page means REST itself has
  // nothing more to give and we should stop.
  const lastSearchPage = searchPages?.pages[searchPages.pages.length - 1];
  const lastSearchPageFullRawButEmptyFiltered = Boolean(
    lastSearchPage &&
      lastSearchPage.rows.length === 0 &&
      lastSearchPage.rawCount >= FILTER_DROPDOWN_PAGE_SIZE
  );

  // Guard against runaway auto-fetch loops when a large stretch of the
  // result set is made of entities whose spaces can't be resolved:
  // count how many pages from the end contributed zero post-filter rows
  // and stop the auto-pump once that streak hits the cap. The user can
  // still click "Load more" manually to push past it.
  const MAX_AUTO_PUMP_EMPTY_PAGES = 10;
  const trailingEmptyPageStreak = React.useMemo(() => {
    const pages = searchPages?.pages ?? [];
    let n = 0;
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].rows.length === 0) n++;
      else break;
    }
    return n;
  }, [searchPages]);
  const autoPumpCapped = trailingEmptyPageStreak >= MAX_AUTO_PUMP_EMPTY_PAGES;

  React.useEffect(() => {
    if (!focused) return;
    if (!hasNextSearchPage) return;
    if (isSearchFetching || isSearchFetchingNextPage) return;
    if (autoPumpCapped) return;
    const initialFillIncomplete = rowsToRender.length < FILTER_DROPDOWN_PAGE_SIZE;
    if (initialFillIncomplete || lastSearchPageFullRawButEmptyFiltered) {
      void fetchNextSearchPage();
    }
  }, [
    focused,
    rowsToRender.length,
    lastSearchPageFullRawButEmptyFiltered,
    autoPumpCapped,
    hasNextSearchPage,
    isSearchFetching,
    isSearchFetchingNextPage,
    fetchNextSearchPage,
  ]);

  const multi = Boolean(onToggleEntity);
  const inputValue = multi ? rawQuery : rawQuery === '' ? selectedValue : rawQuery;

  const handleEntityPick = (result: { id: string; name: string | null }) => {
    clearBlurTimeout();
    if (multi) {
      onToggleEntity?.(result);
    } else {
      setRawQuery('');
      onSelect?.(result);
      setFocused(false);
    }
  };

  return (
    <div ref={interactionRootRef} className="relative w-full">
      <Input
        placeholder={multi ? multiSelectPlaceholder : undefined}
        value={inputValue}
        onChange={e => setRawQuery(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {showDropdown && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList ref={entityResultsListRef} onScroll={handleEntityResultsScroll}>
              {rowsToRender.length === 0 && (isSearchPending || isSearchFetching) ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    Loading…
                  </Text>
                </ResultItem>
              ) : null}
              {rowsToRender.length === 0 && showEmptyHint ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    No matches.
                  </Text>
                </ResultItem>
              ) : null}
              {visibleEntityRows.map((row, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={`search-${row.result.id}`}
                >
                  <ResultContent
                    onClick={() => handleEntityPick(row.result)}
                    active={Boolean(multi && selectedEntityIds?.has(row.result.id))}
                    alreadySelected={false}
                    result={row.result}
                  />
                </motion.div>
              ))}
              {hasNextSearchPage &&
              !isSearchFetchingNextPage &&
              (autoPumpCapped || !lastSearchPageFullRawButEmptyFiltered) &&
              entityVisibleCount >= rowsToRender.length &&
              rowsToRender.length > 0 ? (
                <ResultItem
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => {
                    clearBlurTimeout();
                    void fetchNextSearchPage();
                  }}
                >
                  <Text variant="metadataMedium">Load more</Text>
                </ResultItem>
              ) : null}
              {isSearchFetchingNextPage ||
              (lastSearchPageFullRawButEmptyFiltered && !autoPumpCapped) ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    Loading more…
                  </Text>
                </ResultItem>
              ) : null}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}

interface TableBlockSpaceFilterInputProps {
  onSelect?: (result: { id: string; name: string | null }) => void;
  selectedValue: string;
  selectedSpaceIds?: Set<string>;
  memberSpaceId?: string;
  onToggleSpace?: (result: { id: string; name: string | null }) => void;
}

function TableBlockSpaceFilterInput({
  onSelect,
  selectedValue,
  selectedSpaceIds,
  memberSpaceId,
  onToggleSpace,
}: TableBlockSpaceFilterInputProps) {
  const { query, setQuery, spaces: results } = useSpacesQuery();
  const interactionRootRef = React.useRef<HTMLDivElement>(null);
  const { focused, setFocused, onFocus, onBlur, clearBlurTimeout } =
    useFilterValueInputFocus(interactionRootRef);

  // Default suggestions shown on focus with empty query: the spaces the
  // current block's entity is a member of.
  const { data: memberSpaces = [] } = useQuery({
    queryKey: ['filter-member-spaces', memberSpaceId],
    enabled: Boolean(memberSpaceId),
    staleTime: Duration.toMillis(Duration.seconds(60)),
    queryFn: ({ signal }) => Effect.runPromise(getSpacesWhereMember(memberSpaceId!, signal)),
  });
  const defaultSpaceSuggestions = React.useMemo(
    () =>
      memberSpaces.map(s => ({
        id: s.id,
        name: s.entity.name ?? null,
        image: s.entity.image ?? null,
      })),
    [memberSpaces]
  );

  const showScopedOnlyPanel = focused && !query.trim() && defaultSpaceSuggestions.length > 0;
  const showQueryPanel = Boolean(query.trim());
  const multi = Boolean(onToggleSpace);

  const spaceFullRowCount = showScopedOnlyPanel ? defaultSpaceSuggestions.length : results.length;

  const [spaceVisibleCount, setSpaceVisibleCount] = React.useState(FILTER_DROPDOWN_PAGE_SIZE);
  React.useEffect(() => {
    setSpaceVisibleCount(FILTER_DROPDOWN_PAGE_SIZE);
  }, [query, showScopedOnlyPanel, showQueryPanel, defaultSpaceSuggestions.length, results.length]);

  const visibleScopedSpaceSuggestions = React.useMemo(
    () => defaultSpaceSuggestions.slice(0, spaceVisibleCount),
    [defaultSpaceSuggestions, spaceVisibleCount]
  );

  const visibleSpaceQueryRows = React.useMemo(
    () => results.slice(0, spaceVisibleCount),
    [results, spaceVisibleCount]
  );

  const applySpaceListPagination = React.useCallback(
    (el: HTMLUListElement) => {
      // ~2 result-row heights of early prefetch on top of the baseline.
      const threshold = 275;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const noOverflow = el.scrollHeight <= el.clientHeight + 2;
      const nearBottom = distanceFromBottom <= threshold;
      if (!nearBottom && !noOverflow) return;
      if (spaceVisibleCount < spaceFullRowCount) {
        setSpaceVisibleCount(c => Math.min(c + FILTER_DROPDOWN_PAGE_SIZE, spaceFullRowCount));
      }
    },
    [spaceVisibleCount, spaceFullRowCount]
  );

  const spaceScopedListRef = React.useRef<HTMLUListElement>(null);
  const spaceQueryListRef = React.useRef<HTMLUListElement>(null);
  const handleSpaceResultsScroll = React.useCallback(
    (e: React.UIEvent<HTMLUListElement>) => {
      applySpaceListPagination(e.currentTarget);
    },
    [applySpaceListPagination]
  );

  React.useLayoutEffect(() => {
    if (showScopedOnlyPanel) {
      const el = spaceScopedListRef.current;
      if (el) applySpaceListPagination(el);
    } else if (showQueryPanel) {
      const el = spaceQueryListRef.current;
      if (el) applySpaceListPagination(el);
    }
  }, [
    showScopedOnlyPanel,
    showQueryPanel,
    applySpaceListPagination,
    spaceFullRowCount,
    spaceVisibleCount,
    defaultSpaceSuggestions.length,
    results.length,
  ]);

  const renderSpaceRow = (
    id: string,
    name: string | null,
    image: string | null | undefined,
    onPick: () => void,
    i: number,
    isSelected = false
  ) => (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 * i }}
      key={id}
    >
      <ResultItem
        className={isSelected ? 'bg-grey-02' : undefined}
        onClick={() => {
          clearBlurTimeout();
          if (!multi) setQuery('');
          onPick();
          if (!multi) setFocused(false);
        }}
      >
        <div className="flex w-full items-center justify-between leading-4">
          <Text as="li" variant="metadataMedium" ellipsize className="leading-4.5">
            {name ?? id}
          </Text>
          {isSelected && <CheckCircleSmall color="grey-04" />}
        </div>
        <Spacer height={4} />
        <div className="flex items-center gap-1.5 overflow-hidden">
          {(name ?? id) && <Breadcrumb img={image ?? null}>{(name ?? id) as string}</Breadcrumb>}
          <span style={{ rotate: '270deg' }}>
            <ChevronDownSmall color="grey-04" />
          </span>
          <div className="flex items-center gap-1.5">
            <Tag>Space</Tag>
          </div>
        </div>
      </ResultItem>
    </motion.div>
  );

  const inputDisplay = multi ? query : query === '' ? selectedValue : query;

  return (
    <div ref={interactionRootRef} className="relative w-full">
      <Input
        placeholder={multi ? 'Search…' : undefined}
        value={inputDisplay}
        onChange={e => setQuery(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {showScopedOnlyPanel && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList ref={spaceScopedListRef} onScroll={handleSpaceResultsScroll}>
              {visibleScopedSpaceSuggestions.map((s, i) =>
                renderSpaceRow(
                  s.id,
                  s.name,
                  s.image ?? PLACEHOLDER_SPACE_IMAGE,
                  () =>
                    multi
                      ? onToggleSpace?.(s)
                      : onSelect?.(s),
                  i,
                  Boolean(selectedSpaceIds?.has(s.id))
                )
              )}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
      {showQueryPanel && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList ref={spaceQueryListRef} onScroll={handleSpaceResultsScroll}>
              {visibleSpaceQueryRows.map((result, i) =>
                renderSpaceRow(
                  result.id,
                  result.name,
                  result.image ?? PLACEHOLDER_SPACE_IMAGE,
                  () =>
                    multi
                      ? onToggleSpace?.({ id: result.id, name: result.name })
                      : onSelect?.({ id: result.id, name: result.name }),
                  i,
                  Boolean(selectedSpaceIds?.has(result.id))
                )
              )}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}

interface TableBlockTextFilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Non-relation filter value input (Name, Description, and any scalar
 * value-type filter). Plain controlled input — we don't surface a
 * suggestions dropdown for these today; the user types the exact value
 * they want to filter by.
 */
function TableBlockTextFilterInput({ value, onChange }: TableBlockTextFilterInputProps) {
  return (
    <div className="relative w-full">
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
