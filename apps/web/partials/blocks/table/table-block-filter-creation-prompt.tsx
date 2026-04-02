'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from '@xstate/store/react';
import { Duration, Effect } from 'effect';
import equal from 'fast-deep-equal';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { mergeSearchResult } from '~/core/database/result';
import { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { entityTypesMatchFilter, searchResultMatchesAllowedTypes, useSearch } from '~/core/hooks/use-search';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { getSpacesWhereMember } from '~/core/io/queries';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { E } from '~/core/sync/orm';
import { reactiveRelations } from '~/core/sync/store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import {
  fetchRelationTargetTypeIdsForProperty,
  mergeRelationValueTypesFromStore,
} from '~/core/utils/property/properties';
import type { Relation, Row, SearchResult, SpaceEntity, Value } from '~/core/types';
import { FilterableValueType } from '~/core/value-types';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { ResultItem } from '~/design-system/autocomplete/results-list';
import { Breadcrumb } from '~/design-system/breadcrumb';
import { CloseSmall } from '~/design-system/icons/close-small';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { Divider } from '~/design-system/divider';
import { Dots } from '~/design-system/dots';
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
  filterSuggestionRows?: Row[];
  filterSuggestionEntityIds?: string[];
  filterSuggestionSpaceId?: string;
  onCreate: (filters: TableBlockNewFilterRow[]) => void;
}

const MAX_SCOPED_SUGGESTIONS = 100;

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

function stubSearchResultForFilter(id: string, displayName: string | null): SearchResult {
  const placeholderSpace: SpaceEntity = {
    id: 'space-placeholder',
    name: null,
    description: null,
    spaces: [],
    types: [],
    relations: [],
    values: [],
    spaceId: '',
    image: PLACEHOLDER_SPACE_IMAGE,
  };
  return {
    id,
    name: displayName,
    description: null,
    spaces: [placeholderSpace],
    types: [],
  };
}

function searchResultForFilterDisplay(
  merged: SearchResult | null | undefined,
  id: string,
  displayName: string | null
): SearchResult {
  if (merged?.spaces?.length) return merged;
  return stubSearchResultForFilter(id, displayName);
}

type ScopedFilterSuggestions = {
  entitySuggestions: { id: string; name: string | null }[];
  stringSuggestions: string[];
  spaceSuggestions: { id: string; name: string | null; image: string | null }[];
};

function useScopedFilterSuggestions(
  dataRows: Row[] | undefined,
  selectedColumnId: string,
  valueType: FilterableValueType | undefined,
  blockSpaceId: string | undefined,
  relationTargetTypeIds?: string[],
  activeFilters?: Filter[],
  filterSuggestionEntityIds?: string[],
  waitForRelationTargetTypes?: boolean
): ScopedFilterSuggestions {
  const { store } = useSyncEngine();

  const entityIdsKey = React.useMemo(
    () =>
      (dataRows ?? [])
        .filter(r => !r.placeholder)
        .map(r => r.entityId)
        .sort()
        .join(','),
    [dataRows]
  );

  const entityIdSet = React.useMemo(() => {
    const s = new Set<string>();
    if (entityIdsKey) {
      for (const id of entityIdsKey.split(',')) {
        if (id) s.add(id);
      }
    }
    return s;
  }, [entityIdsKey]);

  const effectiveEntityIdSet = React.useMemo(() => {
    if (filterSuggestionEntityIds?.length) {
      return new Set(filterSuggestionEntityIds);
    }
    return entityIdSet;
  }, [filterSuggestionEntityIds, entityIdSet]);

  const relationsSubset = useRelations({
    selector: React.useCallback(
      (r: Relation) =>
        valueType === 'RELATION' &&
        effectiveEntityIdSet.size > 0 &&
        effectiveEntityIdSet.has(r.fromEntity.id) &&
        r.type.id === selectedColumnId,
      [effectiveEntityIdSet, selectedColumnId, valueType]
    ),
  });
  const relationsByType = useRelations({
    selector: React.useCallback(
      (r: Relation) => valueType === 'RELATION' && r.type.id === selectedColumnId,
      [selectedColumnId, valueType]
    ),
  });
  const valuesSubset = useValues({
    selector: React.useCallback(
      (v: Value) =>
        valueType === 'TEXT' &&
        effectiveEntityIdSet.size > 0 &&
        effectiveEntityIdSet.has(v.entity.id) &&
        v.property.id === selectedColumnId,
      [effectiveEntityIdSet, selectedColumnId, valueType]
    ),
  });

  const spaceStats = React.useMemo(() => {
    if (
      selectedColumnId !== SystemIds.SPACE_FILTER ||
      effectiveEntityIdSet.size === 0 ||
      !blockSpaceId
    ) {
      return { ids: [] as string[], counts: new Map<string, number>() };
    }
    const counts = new Map<string, number>();
    for (const id of effectiveEntityIdSet) {
      const e = store.getEntity(id, { spaceId: blockSpaceId });
      for (const sp of e?.spaces ?? []) {
        counts.set(sp, (counts.get(sp) ?? 0) + 1);
      }
    }
    return { ids: [...counts.keys()], counts };
  }, [selectedColumnId, effectiveEntityIdSet, store, blockSpaceId]);

  const { spacesById } = useSpacesByIds(spaceStats.ids);
  const activeTypeFilterIds = React.useMemo(
    () =>
      (activeFilters ?? [])
        .filter(f => f.columnId === SystemIds.TYPES_PROPERTY)
        .map(f => f.value),
    [activeFilters]
  );

  return React.useMemo((): ScopedFilterSuggestions => {
    if (valueType === 'RELATION') {
      if (waitForRelationTargetTypes) {
        return { entitySuggestions: [], stringSuggestions: [], spaceSuggestions: [] };
      }
      const noMembersInBlock =
        !filterSuggestionEntityIds?.length &&
        (!(dataRows?.length) || (dataRows?.every(r => r.placeholder) ?? true));
      if (noMembersInBlock) {
        return { entitySuggestions: [], stringSuggestions: [], spaceSuggestions: [] };
      }

      const globalCounts = new Map<string, number>();
      const globalMeta = new Map<string, { id: string; name: string | null }>();
      for (const r of relationsByType) {
        if (filterSuggestionEntityIds?.length && !effectiveEntityIdSet.has(r.fromEntity.id)) {
          continue;
        }
        const from = store.getEntity(r.fromEntity.id, blockSpaceId ? { spaceId: blockSpaceId } : undefined);
        const to = store.getEntity(r.toEntity.id, blockSpaceId ? { spaceId: blockSpaceId } : undefined);

        if (activeTypeFilterIds.length > 0) {
          const fromTypeSet = new Set((from?.types ?? []).map(t => t.id));
          if (!activeTypeFilterIds.some(id => fromTypeSet.has(id))) continue;
        }
        if (!entityTypesMatchFilter(to?.types, relationTargetTypeIds)) {
          continue;
        }

        const id = r.toEntity.id;
        globalCounts.set(id, (globalCounts.get(id) ?? 0) + 1);
        if (!globalMeta.has(id)) globalMeta.set(id, { id, name: r.toEntity.name });
      }
      if (globalMeta.size > 0) {
        const entitySuggestions = [...globalMeta.values()]
          .sort((a, b) => {
            const diff = (globalCounts.get(b.id) ?? 0) - (globalCounts.get(a.id) ?? 0);
            if (diff !== 0) return diff;
            return (a.name ?? a.id).localeCompare(b.name ?? b.id);
          })
          .slice(0, MAX_SCOPED_SUGGESTIONS);
        return { entitySuggestions, stringSuggestions: [], spaceSuggestions: [] };
      }

      const counts = new Map<string, number>();
      const meta = new Map<string, { id: string; name: string | null }>();
      for (const r of relationsSubset) {
        const from = store.getEntity(r.fromEntity.id, blockSpaceId ? { spaceId: blockSpaceId } : undefined);
        const to = store.getEntity(r.toEntity.id, blockSpaceId ? { spaceId: blockSpaceId } : undefined);

        if (activeTypeFilterIds.length > 0) {
          const fromTypeSet = new Set((from?.types ?? []).map(t => t.id));
          if (!activeTypeFilterIds.some(id => fromTypeSet.has(id))) continue;
        }
        if (!entityTypesMatchFilter(to?.types, relationTargetTypeIds)) {
          continue;
        }

        const id = r.toEntity.id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (!meta.has(id)) meta.set(id, { id, name: r.toEntity.name });
      }
      const entitySuggestions = [...meta.values()]
        .sort((a, b) => {
          const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
          if (diff !== 0) return diff;
          return (a.name ?? a.id).localeCompare(b.name ?? b.id);
        })
        .slice(0, MAX_SCOPED_SUGGESTIONS);
      return { entitySuggestions, stringSuggestions: [], spaceSuggestions: [] };
    }

    if (selectedColumnId === SystemIds.SPACE_FILTER) {
      const spaceSuggestions = spaceStats.ids
        .map(id => {
          const entity = spacesById.get(id)?.entity;
          return {
            id,
            name: entity?.name ?? null,
            image: entity?.image ?? null,
            _count: spaceStats.counts.get(id) ?? 0,
          };
        })
        .sort((a, b) => {
          const diff = b._count - a._count;
          if (diff !== 0) return diff;
          return (a.name ?? a.id).localeCompare(b.name ?? b.id);
        })
        .map(({ _count: _c, ...rest }) => rest)
        .slice(0, MAX_SCOPED_SUGGESTIONS);
      return { entitySuggestions: [], stringSuggestions: [], spaceSuggestions };
    }

    if (valueType === 'TEXT') {
      if (selectedColumnId === SystemIds.NAME_PROPERTY) {
        const nameCounts = new Map<string, number>();
        const rowNameByEntityId = new Map<string, string>();
        for (const row of dataRows ?? []) {
          if (row.placeholder) continue;
          const n = row.columns[SystemIds.NAME_PROPERTY]?.name?.trim();
          if (n) rowNameByEntityId.set(row.entityId, n);
        }

        for (const id of effectiveEntityIdSet) {
          const entity = store.getEntity(id, blockSpaceId ? { spaceId: blockSpaceId } : undefined);
          const n = entity?.name?.trim() || rowNameByEntityId.get(id)?.trim();
          if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
        }
        const stringSuggestions = [...nameCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([s]) => s)
          .slice(0, MAX_SCOPED_SUGGESTIONS);
        return {
          entitySuggestions: [],
          stringSuggestions,
          spaceSuggestions: [],
        };
      }
      const valueCounts = new Map<string, number>();
      for (const v of valuesSubset) {
        const t = v.value?.trim();
        if (t) valueCounts.set(t, (valueCounts.get(t) ?? 0) + 1);
      }
      const stringSuggestions = [...valueCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([s]) => s)
        .slice(0, MAX_SCOPED_SUGGESTIONS);
      return {
        entitySuggestions: [],
        stringSuggestions,
        spaceSuggestions: [],
      };
    }

    return { entitySuggestions: [], stringSuggestions: [], spaceSuggestions: [] };
  }, [
    dataRows,
    valueType,
    selectedColumnId,
    relationTargetTypeIds,
    activeTypeFilterIds,
    relationsSubset,
    relationsByType,
    valuesSubset,
    spaceStats,
    spacesById,
    store,
    blockSpaceId,
    filterSuggestionEntityIds,
    effectiveEntityIdSet,
    waitForRelationTargetTypes,
  ]);
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
    { trigger, onCreate, options, filterSuggestionRows, filterSuggestionEntityIds, filterSuggestionSpaceId },
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
          filterSuggestionRows={filterSuggestionRows}
          filterSuggestionEntityIds={filterSuggestionEntityIds}
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
  filterSuggestionRows?: Row[];
  filterSuggestionEntityIds?: string[];
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
  filterSuggestionRows,
  filterSuggestionEntityIds,
  filterSuggestionSpaceId,
}: DynamicFiltersProps) {
  const { filterState } = useFilters();
  const onSelectColumnToFilter = (columnId: string) => dispatch({ type: 'selectColumn', payload: { columnId } });

  const selectedEntityIds = React.useMemo(
    () => new Set(state.multiEntitySelections.map(e => e.id)),
    [state.multiEntitySelections]
  );
  const selectedSpaceIds = React.useMemo(
    () => new Set(state.multiSpaceSelections.map(s => s.id)),
    [state.multiSpaceSelections]
  );
  const selectedStringsSet = React.useMemo(
    () => new Set(state.multiStringSelections),
    [state.multiStringSelections]
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

  const scoped = useScopedFilterSuggestions(
    filterSuggestionRows,
    state.selectedColumn,
    selectedOption?.valueType,
    filterSuggestionSpaceId,
    relationTargetTypeIds,
    filterState,
    filterSuggestionEntityIds,
    waitForRelationTargetTypes
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
              scopedSuggestions={scoped.spaceSuggestions}
              selectedSpaceIds={selectedSpaceIds}
              memberSpaceId={filterSuggestionSpaceId}
              onToggleSpace={s => dispatch({ type: 'toggleSpaceSelection', payload: { id: s.id, name: s.name } })}
            />
          ) : selectedOption?.valueType === 'RELATION' ? (
            <TableBlockEntityFilterInput
              filterByTypes={relationTargetTypeIds}
              waitForFilterTypes={waitForRelationTargetTypes}
              restrictSearchToTypes
              suggestionSpaceId={filterSuggestionSpaceId}
              selectedValue=""
              scopedSuggestions={scoped.entitySuggestions}
              selectedEntityIds={selectedEntityIds}
              onToggleEntity={e =>
                dispatch({ type: 'toggleEntitySelection', payload: { id: e.id, name: e.name } })
              }
            />
          ) : (
            <TableBlockTextFilterInput
              value={getFilterValue(state.value)}
              onChange={v => dispatch({ type: 'selectStringValue', payload: { value: v } })}
              stringSuggestions={scoped.stringSuggestions}
              selectedStrings={selectedStringsSet}
              onToggleString={s => dispatch({ type: 'toggleStringSelection', payload: { value: s } })}
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
  /** Space used when listing entities by type for an empty table (relation target browse). */
  suggestionSpaceId?: string;
  scopedSuggestions?: { id: string; name: string | null }[];
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
  suggestionSpaceId,
  scopedSuggestions,
  selectedEntityIds,
  onToggleEntity,
  multiSelectPlaceholder,
}: TableBlockEntityFilterInputProps) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const autocomplete = useSearch(
    filterByTypes?.length || waitForFilterTypes || restrictSearchToTypes
      ? {
          filterByTypes: filterByTypes?.length ? filterByTypes : undefined,
          waitForFilterTypes: waitForFilterTypes || undefined,
          restrictToFilterTypes: restrictSearchToTypes || undefined,
        }
      : undefined
  );
  const [focused, setFocused] = React.useState(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const onFocus = () => {
    clearBlurTimeout();
    setFocused(true);
  };

  const onBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setFocused(false), 120);
  };

  const filteredScoped = React.useMemo(() => {
    if (!scopedSuggestions?.length) return [];
    const q = autocomplete.query.trim().toLowerCase();
    const list = !q
      ? scopedSuggestions
      : scopedSuggestions.filter(
          s =>
            (s.name ?? '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
        );
    return list.slice(0, MAX_SCOPED_SUGGESTIONS);
  }, [scopedSuggestions, autocomplete.query]);

  const filteredScopedByTargetType = React.useMemo(() => {
    if (!filterByTypes?.length && (waitForFilterTypes || restrictSearchToTypes)) {
      return [];
    }
    if (!filterByTypes?.length) return filteredScoped;
    return filteredScoped.filter(s => {
      const e = store.getEntity(s.id, suggestionSpaceId ? { spaceId: suggestionSpaceId } : undefined);
      return entityTypesMatchFilter(e?.types, filterByTypes);
    });
  }, [filteredScoped, filterByTypes, waitForFilterTypes, restrictSearchToTypes, store, suggestionSpaceId]);

  const canBrowseByType = Boolean(filterByTypes?.length) && !waitForFilterTypes;
  const browseEnabled =
    focused &&
    filteredScopedByTargetType.length === 0 &&
    !autocomplete.query.trim() &&
    canBrowseByType;

  const { data: browseResults = [], isFetching: isBrowseFetching } = useQuery({
    queryKey: [
      'table-block-filter-entity-browse',
      filterByTypes?.slice().sort().join(',') ?? '',
      suggestionSpaceId ?? '',
    ],
    enabled: browseEnabled,
    queryFn: async () => {
      const where = {
        types: filterByTypes!.map(id => ({ id: { equals: id } })),
      };
      const entities = await E.findMany({
        store,
        cache,
        where,
        first: 25,
        skip: 0,
        spaceId: suggestionSpaceId,
      });
      const merged = await Promise.all(entities.map(e => mergeSearchResult({ id: e.id, store })));
      return merged.filter((r): r is SearchResult => r != null);
    },
    staleTime: Duration.toMillis(Duration.seconds(60)),
  });

  const rowsToRender = React.useMemo(() => {
    const q = autocomplete.query.trim();
    if (!q) {
      if (filteredScopedByTargetType.length > 0) {
        return filteredScopedByTargetType.map(s => ({ kind: 'scoped' as const, scoped: s }));
      }
      if (browseResults.length > 0) {
        return browseResults
          .filter(r => searchResultMatchesAllowedTypes(r, filterByTypes))
          .map(r => ({ kind: 'search' as const, result: r }));
      }
      return [];
    }
    const seen = new Set(filteredScopedByTargetType.map(s => s.id));
    const fuzzyRows = autocomplete.results
      .filter(r => !seen.has(r.id))
      .filter(r => {
        if (restrictSearchToTypes && !filterByTypes?.length) return false;
        return searchResultMatchesAllowedTypes(r, filterByTypes);
      });
    return [
      ...filteredScopedByTargetType.map(s => ({ kind: 'scoped' as const, scoped: s })),
      ...fuzzyRows.map(r => ({ kind: 'search' as const, result: r })),
    ];
  }, [
    filteredScopedByTargetType,
    autocomplete.query,
    autocomplete.results,
    browseResults,
    filterByTypes,
    restrictSearchToTypes,
  ]);

  const scopedResultQueries = useQueries({
    queries: filteredScopedByTargetType.map(s => ({
      queryKey: ['table-block-filter-scoped-entity', s.id] as const,
      queryFn: () => mergeSearchResult({ id: s.id, store }),
      enabled: focused && filteredScopedByTargetType.length > 0,
      staleTime: Duration.toMillis(Duration.seconds(60)),
    })),
  });

  const scopedResultById = React.useMemo(() => {
    const m = new Map<string, SearchResult>();
    filteredScopedByTargetType.forEach((s, idx) => {
      const data = scopedResultQueries[idx]?.data;
      if (data != null) m.set(s.id, data);
    });
    return m;
  }, [filteredScopedByTargetType, scopedResultQueries]);

  const showEmptyBrowseHint =
    canBrowseByType &&
    filteredScopedByTargetType.length === 0 &&
    !autocomplete.query.trim() &&
    !isBrowseFetching &&
    browseResults.length === 0;

  const showDropdown =
    focused &&
    (rowsToRender.length > 0 || (browseEnabled && isBrowseFetching) || showEmptyBrowseHint);
  const multi = Boolean(onToggleEntity);
  const inputValue = multi
    ? autocomplete.query
    : autocomplete.query === ''
      ? selectedValue
      : autocomplete.query;

  const handleEntityPick = (result: { id: string; name: string | null }) => {
    clearBlurTimeout();
    if (multi) {
      onToggleEntity?.(result);
    } else {
      autocomplete.onQueryChange('');
      onSelect?.(result);
      setFocused(false);
    }
  };

  return (
    <div className="relative w-full">
      <Input
        placeholder={multi ? multiSelectPlaceholder : undefined}
        value={inputValue}
        onChange={e => autocomplete.onQueryChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {showDropdown && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {rowsToRender.length === 0 && isBrowseFetching ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    Loading…
                  </Text>
                </ResultItem>
              ) : null}
              {rowsToRender.length === 0 && showEmptyBrowseHint ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    Type to search, or pick from the list when the table has rows.
                  </Text>
                </ResultItem>
              ) : null}
              {rowsToRender.map((row, i) =>
                row.kind === 'scoped' ? (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                    key={`scoped-${row.scoped.id}`}
                  >
                    <ResultContent
                      result={searchResultForFilterDisplay(
                        scopedResultById.get(row.scoped.id),
                        row.scoped.id,
                        row.scoped.name
                      )}
                      onClick={() => handleEntityPick(row.scoped)}
                      active={Boolean(multi && selectedEntityIds?.has(row.scoped.id))}
                      alreadySelected={false}
                    />
                  </motion.div>
                ) : (
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
                )
              )}
            </ResultsList>
            {autocomplete.isLoading && (
              <div className="flex items-center justify-center py-3">
                <Dots />
              </div>
            )}
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}

interface TableBlockSpaceFilterInputProps {
  onSelect?: (result: { id: string; name: string | null }) => void;
  selectedValue: string;
  scopedSuggestions?: { id: string; name: string | null; image: string | null }[];
  selectedSpaceIds?: Set<string>;
  memberSpaceId?: string;
  onToggleSpace?: (result: { id: string; name: string | null }) => void;
}

function TableBlockSpaceFilterInput({
  onSelect,
  selectedValue,
  scopedSuggestions,
  selectedSpaceIds,
  memberSpaceId,
  onToggleSpace,
}: TableBlockSpaceFilterInputProps) {
  const { query, setQuery, spaces: results } = useSpacesQuery();
  const [focused, setFocused] = React.useState(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const scopedWhenEmpty = React.useMemo(() => {
    if (!scopedSuggestions?.length) return [];
    return scopedSuggestions.slice(0, MAX_SCOPED_SUGGESTIONS);
  }, [scopedSuggestions]);
  const { data: memberSpaces = [] } = useQuery({
    queryKey: ['filter-member-spaces', memberSpaceId],
    enabled: Boolean(memberSpaceId),
    staleTime: Duration.toMillis(Duration.seconds(60)),
    queryFn: ({ signal }) => Effect.runPromise(getSpacesWhereMember(memberSpaceId!, signal)),
  });
  const defaultSpaceSuggestions = React.useMemo(() => {
    const out: { id: string; name: string | null; image: string | null }[] = [];
    const seen = new Set<string>();
    for (const s of scopedWhenEmpty) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    for (const s of memberSpaces) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ id: s.id, name: s.entity.name ?? null, image: s.entity.image ?? null });
    }
    return out.slice(0, MAX_SCOPED_SUGGESTIONS);
  }, [scopedWhenEmpty, memberSpaces]);

  const mergedWhenQuery = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scopedMatches = (scopedSuggestions ?? []).filter(
      s => (s.name ?? '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
    const seen = new Set(scopedMatches.map(s => s.id));
    const remote = results.filter(r => !seen.has(r.id));
    return [
      ...scopedMatches.map(s => ({ kind: 'scoped' as const, scoped: s })),
      ...remote.map(r => ({ kind: 'remote' as const, result: r })),
    ].slice(0, MAX_SCOPED_SUGGESTIONS);
  }, [query, scopedSuggestions, results]);

  const showScopedOnlyPanel = focused && !query.trim() && defaultSpaceSuggestions.length > 0;
  const showQueryPanel = Boolean(query.trim());
  const multi = Boolean(onToggleSpace);

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
    <div className="relative w-full">
      <Input
        placeholder={multi ? 'Search…' : undefined}
        value={inputDisplay}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => {
          clearBlurTimeout();
          setFocused(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => setFocused(false), 120);
        }}
      />
      {showScopedOnlyPanel && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {defaultSpaceSuggestions.map((s, i) =>
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
            <ResultsList>
              {mergedWhenQuery.length > 0
                ? mergedWhenQuery.map((row, i) =>
                    row.kind === 'scoped'
                      ? renderSpaceRow(
                          row.scoped.id,
                          row.scoped.name,
                          row.scoped.image ?? PLACEHOLDER_SPACE_IMAGE,
                          () =>
                            multi
                              ? onToggleSpace?.(row.scoped)
                              : onSelect?.(row.scoped),
                          i,
                          Boolean(selectedSpaceIds?.has(row.scoped.id))
                        )
                      : renderSpaceRow(
                          row.result.id,
                          row.result.name,
                          row.result.image ?? PLACEHOLDER_SPACE_IMAGE,
                          () =>
                            multi
                              ? onToggleSpace?.({
                                  id: row.result.id,
                                  name: row.result.name,
                                })
                              : onSelect?.({
                                  id: row.result.id,
                                  name: row.result.name,
                                }),
                          i,
                          Boolean(selectedSpaceIds?.has(row.result.id))
                        )
                  )
                : results.map((result, i) =>
                    renderSpaceRow(
                      result.id,
                      result.name,
                      result.image ?? PLACEHOLDER_SPACE_IMAGE,
                      () =>
                        multi
                          ? onToggleSpace?.({ id: result.id, name: result.name })
                          : onSelect?.({
                              id: result.id,
                              name: result.name,
                            }),
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
  stringSuggestions: string[];
  selectedStrings?: Set<string>;
  onToggleString?: (s: string) => void;
}

function TableBlockTextFilterInput({
  value,
  onChange,
  stringSuggestions,
  selectedStrings,
  onToggleString,
}: TableBlockTextFilterInputProps) {
  const [focused, setFocused] = React.useState(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const filtered = React.useMemo(() => {
    if (!stringSuggestions.length) return [];
    const q = value.trim().toLowerCase();
    const list = !q
      ? stringSuggestions
      : stringSuggestions.filter(s => s.toLowerCase().includes(q));
    return list.slice(0, MAX_SCOPED_SUGGESTIONS);
  }, [stringSuggestions, value]);

  const showEmptyTextHint = focused && stringSuggestions.length === 0;
  const showDropdown = focused && (showEmptyTextHint || filtered.length > 0);
  const multi = Boolean(onToggleString);

  return (
    <div className="relative w-full">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          clearBlurTimeout();
          setFocused(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => setFocused(false), 120);
        }}
      />
      {showDropdown && (
        <div
          className="absolute top-10 z-1 flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
          onPointerDown={e => e.preventDefault()}
        >
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {showEmptyTextHint ? (
                <ResultItem className="pointer-events-none">
                  <Text color="grey-03" variant="metadataMedium">
                    Type a value to filter. Suggestions appear when the table has matching rows.
                  </Text>
                </ResultItem>
              ) : null}
              {filtered.map((s, i) => {
                const isSel = Boolean(selectedStrings?.has(s));
                return (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                    key={s}
                  >
                    <ResultItem
                      className={isSel ? 'bg-grey-02' : undefined}
                      onClick={() => {
                        clearBlurTimeout();
                        if (multi) {
                          onToggleString?.(s);
                        } else {
                          onChange(s);
                          setFocused(false);
                        }
                      }}
                    >
                      <div className="flex w-full items-center justify-between leading-4">
                        <Text variant="metadataMedium" ellipsize className="leading-4.5">
                          {s}
                        </Text>
                        {multi && isSel && <CheckCircleSmall color="grey-04" />}
                      </div>
                    </ResultItem>
                  </motion.div>
                );
              })}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}
