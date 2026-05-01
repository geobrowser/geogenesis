import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { ID } from '~/core/id';
import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Cell, Property, Row } from '~/core/types';
import { sortRows } from '~/core/utils/utils';

import { useProperties } from '../../hooks/use-properties';
import { mapSelectorLexiconToSourceEntity, parseSelectorIntoLexicon } from './data-selectors';
import { Filter, FilterMode, ModesByColumn } from './filters';
import { FilterableValueType } from '~/core/value-types';
import { ValueDataType } from '~/core/sync/experimental_query-layer';
import { Source } from './source';
import { useCollection } from './use-collection';
import { useFilters } from './use-filters';
import { mappingToCell, mappingToRows } from './use-mapping';
import { usePagination } from './use-pagination';
import { useRelationsBlock } from './use-relations-block';
import { useSort } from './use-sort';
import { useSource } from './use-source';
import { useView } from './use-view';

export const PAGE_SIZE = 9;

interface RenderablesQueryKey {
  sourceType: Source['type'];
  sourceKey: string;
  mappingKey: string;
  spaceId: string;
  relationIdsKey: string;
}

const queryKeys = {
  relationQuery: (args: RenderablesQueryKey) => ['blocks', 'data', 'renderables', args],
  columnsSchema: (columns?: Property[]) => ['blocks', 'data', 'columns-schema', columns],
};

interface UseDataBlockOptions {
  filterState?: Filter[];
  modesByColumn?: ModesByColumn;
  canEdit?: boolean;
}

export function useDataBlock(options?: UseDataBlockOptions) {
  const {
    entityId,
    spaceId,
    pageNumber,
    currentAfter,
    currentOffset,
    relationId,
    setPage,
    recordEndCursor,
    reset: resetPagination,
    canJumpTo,
    maxJumpPages,
  } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity, isLoading: isBlockEntityLoading } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const {
    filterState: dbFilterState,
    resolvedFilterState: dbResolvedFilterState,
    isFilterResolving,
    modesByColumn: dbModesByColumn,
    filterableProperties,
    setFilterState,
    setGroupMode,
    temporaryFilters,
    temporaryModesByColumn,
    setTemporaryFilters,
    setTemporaryGroupMode,
  } = useFilters(options?.canEdit);

  const { source, setSource } = useSource({ filterState: dbFilterState, setFilterState });
  const { relationBlockSourceRelations } = useRelationsBlock({ source, filterState: dbFilterState });

  const activeFilterState = options?.canEdit ? dbResolvedFilterState : temporaryFilters;
  const activeModesByColumn = options?.canEdit ? dbModesByColumn : temporaryModesByColumn;
  const effectiveFilterState = options?.filterState ?? activeFilterState;
  const effectiveModesByColumn = options?.modesByColumn ?? activeModesByColumn;
  const {
    shownColumnIds,
    mapping,
    isLoading: isViewLoading,
    isFetched: isViewFetched,
    view,
    placeholder,
    viewRelation,
    setView,
    shownColumnRelations,
    toggleProperty,
  } = useView();

  const { sortState, setSortState } = useSort(options?.canEdit);

  const filterStateKey = React.useMemo(() => stableStringify(effectiveFilterState), [effectiveFilterState]);
  const modesByColumnKey = React.useMemo(() => stableStringify(effectiveModesByColumn), [effectiveModesByColumn]);
  const where = React.useMemo(
    () => filterStateToWhere(effectiveFilterState, effectiveModesByColumn),
    [filterStateKey, modesByColumnKey, effectiveFilterState, effectiveModesByColumn]
  );

  // Use the mapping to get the potential renderable properties.
  const propertiesSchema = useProperties(shownColumnIds);

  // Map sortState to server-side sort params — used by all source types.
  // dataType is required by the backend's entitiesOrderedByProperty SQL function
  // to resolve which value column to sort on.
  // Look up from shown columns first, then fall back to all filterable properties
  // (allows sorting by properties not currently visible in the table).
  const serverSort = React.useMemo(() => {
    if (!sortState) return undefined;
    const property =
      propertiesSchema?.[sortState.columnId] ?? filterableProperties.find(p => p.id === sortState.columnId);
    return {
      propertyId: sortState.columnId,
      direction: sortState.direction,
      dataType: property?.dataType?.toLowerCase(),
    };
  }, [sortState, propertiesSchema, filterableProperties]);

  // Fetch collection data with server-side filtering and sorting
  const {
    collectionItems,
    collectionRelations,
    isFetched: isCollectionFetched,
    isLoading: isCollectionLoading,
    collectionLength,
    filterSuggestionEntityIds: collectionFilterSuggestionEntityIds,
    endCursor: collectionEndCursor,
    hasNextPage: collectionHasNextPage,
    isPlaceholderData: isCollectionPlaceholder,
  } = useCollection({
    source,
    first: PAGE_SIZE,
    pageNumber,
    after: currentAfter,
    offset: currentOffset !== undefined ? currentOffset * PAGE_SIZE : undefined,
    where: where,
    sort: serverSort,
  });

  // For COLLECTION sources we already have the row ids locally (from
  // collectionRelations), so we expose them without any network work. For
  // SPACES/GEO sources we used to fire a massive entitiesConnection fetch
  // here to seed filter-suggestion scoping; the filter dropdown has since
  // been rewritten to paginate against the REST /search endpoint directly
  // and no longer consumes these ids, so this hook intentionally returns
  // undefined for non-COLLECTION sources. The field is kept for
  // COLLECTION consumers that still use it downstream.
  const filterSuggestionEntityIds = source.type === 'COLLECTION' ? collectionFilterSuggestionEntityIds : undefined;

  // For COLLECTION sources, server-side filtering is now applied in useCollection
  // We just need to organize the data here
  const collectionData = React.useMemo(() => {
    return {
      items: collectionItems,
      relations: collectionRelations,
      totalCount: collectionLength,
    };
  }, [collectionItems, collectionRelations, collectionLength]);

  const {
    entities: queriedEntities,
    isLoading: isQueryEntitiesLoading,
    isFetched: isQueryEntitiesFetched,
    isPlaceholderData: isQueryEntitiesPlaceholder,
    endCursor: queriedEndCursor,
    hasNextPage: queriedHasNextPage,
  } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: PAGE_SIZE,
    after: currentAfter,
    offset: currentOffset !== undefined ? currentOffset * PAGE_SIZE : undefined,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
    sort: serverSort,
  });

  // Anchor the cursor of the page we just fetched so subsequent forward
  // navigation (single steps or jumps) starts from the closest known anchor
  // and keeps the SQL offset small. Skip while serving placeholder data —
  // `queriedEndCursor` is still from the prior page in that window and
  // would write a wrong-page anchor.
  React.useEffect(() => {
    if (source.type !== 'SPACES' && source.type !== 'GEO') return;
    if (!isQueryEntitiesFetched) return;
    if (isQueryEntitiesPlaceholder) return;
    recordEndCursor(pageNumber, queriedEndCursor);
  }, [source.type, isQueryEntitiesFetched, isQueryEntitiesPlaceholder, queriedEndCursor, pageNumber, recordEndCursor]);

  React.useEffect(() => {
    if (source.type !== 'COLLECTION') return;
    if (!serverSort) return;
    if (!isCollectionFetched) return;
    if (isCollectionPlaceholder) return;
    recordEndCursor(pageNumber, collectionEndCursor);
  }, [
    source.type,
    serverSort,
    isCollectionFetched,
    isCollectionPlaceholder,
    collectionEndCursor,
    pageNumber,
    recordEndCursor,
  ]);

  const mappingKey = React.useMemo(() => stableStringify(mapping), [mapping]);
  const sourceKey = React.useMemo(() => {
    if (source.type === 'SPACES') {
      return source.value.slice().sort().join(',');
    }

    if (source.type === 'GEO') {
      return 'GEO';
    }

    return source.value;
  }, [source]);
  const relationIdsKey = React.useMemo(
    () =>
      relationBlockSourceRelations
        .map(relation => relation.id)
        .sort()
        .join(','),
    [relationBlockSourceRelations]
  );

  const relationQueryKey = React.useMemo(
    () =>
      queryKeys.relationQuery({
        sourceType: source.type,
        sourceKey,
        mappingKey,
        spaceId,
        relationIdsKey,
      }),
    [mappingKey, relationIdsKey, source.type, sourceKey, spaceId]
  );

  const {
    data: relationsMapping,
    isLoading: isRelationDataLoading,
    isFetched: isRelationDataFetched,
  } = useQuery({
    enabled: source.type === 'RELATIONS',
    placeholderData: keepPreviousData,
    // @TODO: Should re-run when the relations for the entity source changes
    queryKey: relationQueryKey,
    queryFn: async () => {
      const run = Effect.gen(function* () {
        if (source.type === 'RELATIONS') {
          const data = yield* Effect.forEach(
            relationBlockSourceRelations,
            relation =>
              Effect.promise(async () => {
                const cells: Cell[] = [];

                for (const [propertyId, selector] of Object.entries(mapping)) {
                  const lexicon = parseSelectorIntoLexicon(selector);
                  const entities = await mapSelectorLexiconToSourceEntity(lexicon, relation.id);
                  cells.push(mappingToCell(entities, propertyId, lexicon));
                }

                return {
                  entityId: relation.id,
                  columns: cells.reduce<Record<string, Cell>>((acc, cell) => {
                    acc[cell.slotId] = cell;
                    return acc;
                  }, {}),
                };
              }),
            {
              concurrency: 10,
            }
          );

          return data;
        }

        return [];
      });

      // @TODO: Error handling
      return await Effect.runPromise(run);
    },
  });

  /**
   * Data blocks support several "query" modes which require fetching and aggregating
   * different data in different ways. In order to simplify rendering we want to map
   * the data from each of these modes into a unified format. This keeps the complexities
   * of the query modes out of the UI/rendering code.
   *
   * For COLLECTION data blocks we read collection item relations directly from the data
   * block itself.
   *
   * For ENTITIES data blocks, we read from a filter stored on the data block and make a
   * dynamic query for any entities that match the filter.
   *
   * For RELATIONS data blocks, we start from a _specific_ entity and dynamically fetch
   * specific data from that entity to render in the data block. e.g., I might want to
   * render the name of the entity, the Spouse relation's to entity avatar, and the
   * Spouse relation's description. This requires reading data from three different
   * entities. In order to specify the specific data set, we use a mechanism called
   * "Selectors." Selectors are a custom DSL for specifying which data to fetch from
   * an entity. Selectors live on the "Properties" relation pointing from the Blocks
   * relation pointing to the data block.
   */
  const rows = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      return mappingToRows(collectionData.items, shownColumnIds, collectionData.relations);
    }

    if (source.type === 'GEO' || source.type === 'SPACES') {
      return mappingToRows(queriedEntities, shownColumnIds, []);
    }

    if (source.type === 'RELATIONS') {
      return (
        relationsMapping?.map(
          item =>
            ({
              ...item,
              placeholder: false,
            }) as Row
        ) ?? []
      );
    }

    return [];
  }, [collectionData.items, collectionData.relations, queriedEntities, relationsMapping, shownColumnIds, source.type]);

  // Reset to page 0 (and drop all cursor anchors) when the filter or sort
  // signature changes — cursors are tied to a specific filter+sort combination
  // and stop being meaningful when either changes.
  const sortKey = React.useMemo(() => stableStringify(serverSort ?? null), [serverSort]);
  const lastResetKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${filterStateKey}::${sortKey}`;
    if (lastResetKeyRef.current !== null && lastResetKeyRef.current !== key) {
      resetPagination();
    }
    lastResetKeyRef.current = key;
  }, [filterStateKey, sortKey, resetPagination]);

  const totalPages = Math.ceil(collectionData.totalCount / PAGE_SIZE);
  const sortedRows = React.useMemo(
    () => (sortState ? rows.slice(0, PAGE_SIZE) : (sortRows(rows)?.slice(0, PAGE_SIZE) ?? [])),
    [rows, sortState]
  );
  const properties = React.useMemo(() => (propertiesSchema ? Object.values(propertiesSchema) : []), [propertiesSchema]);

  const setName = (newName: string) => {
    storage.entities.name.set(entityId, spaceId, newName);
  };

  let isLoading = true;
  const isSharedDataLoading = isBlockEntityLoading || isFilterResolving || isViewLoading || !isViewFetched;

  if (source.type === 'COLLECTION') {
    isLoading = isCollectionLoading || !isCollectionFetched || isSharedDataLoading;
  }

  if (source.type === 'RELATIONS') {
    isLoading = !isRelationDataFetched || isRelationDataLoading || isSharedDataLoading;
  }

  if (source.type === 'GEO' || source.type === 'SPACES') {
    isLoading = isQueryEntitiesLoading || isSharedDataLoading;
  }

  let isFetched = false;
  if (source.type === 'COLLECTION') {
    isFetched = isCollectionFetched && !isSharedDataLoading;
  } else if (source.type === 'RELATIONS') {
    isFetched = isRelationDataFetched && !isSharedDataLoading;
  } else if (source.type === 'GEO' || source.type === 'SPACES') {
    isFetched = isQueryEntitiesFetched && !isSharedDataLoading;
  }

  // @TODO: Returned data type should be a FSM depending on the source.type
  // For COLLECTION with a server-side sort, the response is a single page so
  // count math is misleading (totalCount caps at pageSize when filter+sort
  // are combined) — read hasNextPage off the connection. For unsorted
  // COLLECTION we fetched every matching id, so count math is accurate.
  // For SPACES/GEO we read the cursor signal directly off the GraphQL response.
  const hasNextPage =
    source.type === 'COLLECTION'
      ? serverSort
        ? collectionHasNextPage
        : (pageNumber + 1) * PAGE_SIZE < collectionData.totalCount
      : source.type === 'GEO' || source.type === 'SPACES'
        ? queriedHasNextPage
        : false;

  const result = {
    entityId,
    spaceId,
    relationId,

    blockEntity: entity,
    rows: sortedRows,
    properties,
    propertiesSchema,

    pageNumber,
    pageSize: PAGE_SIZE,
    hasNextPage,
    hasPreviousPage: pageNumber > 0,
    setPage,
    canJumpTo,
    maxJumpPages,

    isLoading,
    isFetched,

    name: entity?.name ?? null,
    setName,
    totalPages,
    collectionLength: collectionData.totalCount,

    relations: entity?.relations,
    collectionRelations: source.type === 'COLLECTION' ? collectionData.relations : undefined,
    filterSuggestionEntityIds,

    // From useView
    view,
    placeholder,
    shownColumnIds,
    viewRelation,
    setView,
    shownColumnRelations,
    toggleProperty,

    // From useSource
    source,
    setSource,

    // From useFilters
    filterState: effectiveFilterState,
    resolvedFilterState: dbResolvedFilterState,
    modesByColumn: effectiveModesByColumn,
    dbFilterState,
    dbModesByColumn,
    setFilterState,
    setGroupMode,
    filterableProperties,

    temporaryFilters,
    temporaryModesByColumn,
    setTemporaryFilters,
    setTemporaryGroupMode,

    // From useSort
    sortState,
    setSortState,
  };

  return result;
}

const DataBlockContext = React.createContext<{
  entityId: string;
  spaceId: string;
  relationId: string;
  pageNumber: number;
  currentAfter: string | undefined;
  currentOffset: number | undefined;
  setPage: (page: number | 'next' | 'previous') => void;
  recordEndCursor: (fetchedPage: number, endCursor: string | null) => void;
  reset: () => void;
  canJumpTo: (target: number) => boolean;
  maxJumpPages: number;
} | null>(null);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
  relationId: string;
}

export function DataBlockProvider({ spaceId, children, entityId, relationId }: Props) {
  const { pageNumber, currentAfter, currentOffset, setPage, recordEndCursor, reset, canJumpTo, maxJumpPages } =
    usePagination(entityId);

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
      pageNumber,
      currentAfter,
      currentOffset,
      setPage,
      recordEndCursor,
      reset,
      canJumpTo,
      maxJumpPages,
    };
  }, [
    spaceId,
    entityId,
    relationId,
    pageNumber,
    currentAfter,
    currentOffset,
    setPage,
    recordEndCursor,
    reset,
    canJumpTo,
    maxJumpPages,
  ]);

  return <DataBlockContext.Provider value={store}>{children}</DataBlockContext.Provider>;
}

export function useDataBlockInstance() {
  const context = React.useContext(DataBlockContext);

  if (context === null) {
    throw new Error(`Missing DataBlockProvider`);
  }

  return context;
}

/** Per-group default mode. Multi-value RELATION/TEXT collapses cleanly to `in`. */
const DEFAULT_GROUP_MODE: FilterMode = 'OR';

/**
 * Group key shared by all filter chips that combine into a single GraphQL
 * clause. Backlinks bucket under `_relation` so multiple backlink chips on
 * the same relation type collapse to a single `backlinks: [...]` clause
 * (matching the persisted format).
 */
function groupKeyFor(f: Filter): string {
  const isBacklink = f.isBacklink || f.columnName === 'Backlink';
  return isBacklink ? `_relation:${f.columnId}` : f.columnId;
}

export function filterStateToWhere(filterState: Filter[], modesByColumn: ModesByColumn = {}): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  // Bucket filters by column, then build one WhereCondition per group using
  // that group's mode. Between groups is always AND (the global mode is gone).
  const groups = new Map<string, Filter[]>();
  for (const f of filterState) {
    const key = groupKeyFor(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const groupConditions: WhereCondition[] = [];
  for (const [groupKey, filters] of groups) {
    // The persisted modes map keys backlinks under their columnId, not the
    // synthetic group key with the `_relation:` prefix. Strip the prefix when
    // looking up the mode so a group of backlinks finds its mode.
    const lookupKey = groupKey.startsWith('_relation:') ? groupKey.slice('_relation:'.length) : groupKey;
    const groupMode = modesByColumn[lookupKey] ?? DEFAULT_GROUP_MODE;
    groupConditions.push(buildGroupWhere(filters, groupMode));
  }

  if (groupConditions.length === 1) return groupConditions[0];

  // Flat merge keeps `spaces`/`types` at the top level so they get promoted
  // to fast top-level GraphQL query params instead of buried in a nested AND filter.
  return mergeWhereConditions(groupConditions);
}

function mergeWhereConditions(conditions: WhereCondition[]): WhereCondition {
  const arrayKeys = new Set(['spaces', 'types', 'values', 'relations', 'backlinks', 'AND', 'OR']);
  const merged: WhereCondition = {};
  const unmerged: WhereCondition[] = [];

  for (const cond of conditions) {
    const keys = Object.keys(cond) as (keyof WhereCondition)[];
    let canMerge = true;

    for (const key of keys) {
      if (arrayKeys.has(key)) continue; // arrays are always mergeable
      if (key in merged) {
        canMerge = false;
        break;
      }
    }

    if (canMerge) {
      for (const key of keys) {
        if (arrayKeys.has(key)) {
          const existing = (merged as any)[key] as unknown[] | undefined;
          const incoming = (cond as any)[key] as unknown[];
          (merged as any)[key] = existing ? [...existing, ...incoming] : [...incoming];
        } else {
          (merged as any)[key] = (cond as any)[key];
        }
      }
    } else {
      unmerged.push(cond);
    }
  }

  if (unmerged.length === 0) return merged;
  return { AND: [merged, ...unmerged] };
}

function valueDataTypeFor(valueType: FilterableValueType): ValueDataType | undefined {
  switch (valueType) {
    case 'TEXT':
    case 'INTEGER':
    case 'FLOAT':
    case 'DECIMAL':
    case 'DATETIME':
    case 'DATE':
    case 'TIME':
    case 'BOOLEAN':
      return valueType;
    default:
      return undefined;
  }
}

function buildSingleFilterWhere(f: Filter): WhereCondition {
  if (f.valueType === 'TEXT') {
    if (ID.equals(f.columnId, SystemIds.NAME_PROPERTY)) {
      return { name: { contains: f.value } };
    }
    return {
      values: [{ propertyId: { equals: f.columnId }, value: { contains: f.value }, dataType: 'TEXT' }],
    };
  }

  if (f.valueType === 'RELATION') {
    if (ID.equals(f.columnId, SystemIds.SPACE_FILTER)) {
      return { spaces: [{ equals: f.value }] };
    }
    if (ID.equals(f.columnId, SystemIds.TYPES_PROPERTY)) {
      return { types: [{ id: { equals: f.value } }] };
    }
    if (f.isBacklink || f.columnName === 'Backlink') {
      return {
        backlinks: [{ typeOf: { id: { equals: f.columnId } }, fromEntity: { id: { equals: f.value } } }],
      };
    }
    return {
      relations: [{ typeOf: { id: { equals: f.columnId } }, toEntity: { id: { equals: f.value } } }],
    };
  }

  return {};
}

/**
 * Build a single WhereCondition for one property group (all filter chips
 * sharing the same columnId, or all backlink chips of the same relation
 * type). The returned shape depends on `groupMode`:
 *
 * - `'OR'` (default) collapses multi-value RELATION/TEXT groups to one
 *   clause using the schema's `in` / `inInsensitive` operators — far less
 *   verbose than `OR: [{...}, {...}, ...]` on the wire.
 * - `'AND'` wraps each chip as a separate AND clause so "tagged with both
 *   X and Y" stays expressible. Same shape as the prior `buildAndWhere`.
 */
function buildGroupWhere(filters: Filter[], groupMode: FilterMode): WhereCondition {
  if (filters.length === 0) return {};
  if (filters.length === 1) return buildSingleFilterWhere(filters[0]);

  if (groupMode === 'AND') {
    // AND-of-singles. Each chip evaluated independently (matches the local
    // query engine's matchesCondition expectations and lets the converter
    // emit a real GraphQL `and: [...]`).
    return { AND: filters.map(f => buildSingleFilterWhere(f)) };
  }

  // OR mode → in-collapse where the schema supports it.
  const head = filters[0];
  const isBacklink = head.isBacklink || head.columnName === 'Backlink';
  const values = filters.map(f => f.value);

  if (head.valueType === 'RELATION') {
    if (ID.equals(head.columnId, SystemIds.SPACE_FILTER)) {
      // Top-level `spaces` already promotes to the fast `spaceIds` query param.
      // Multiple values stay as multiple StringConditions; the converter
      // collects them into a single UuidListFilter.
      return { spaces: values.map(v => ({ equals: v })) };
    }
    if (ID.equals(head.columnId, SystemIds.TYPES_PROPERTY)) {
      // Same story for `types` → `typeIds`.
      return { types: values.map(v => ({ id: { equals: v } })) };
    }
    if (isBacklink) {
      return {
        backlinks: [{ typeOf: { id: { equals: head.columnId } }, fromEntity: { id: { in: values } } }],
      };
    }
    return {
      relations: [{ typeOf: { id: { equals: head.columnId } }, toEntity: { id: { in: values } } }],
    };
  }

  if (head.valueType === 'TEXT') {
    if (ID.equals(head.columnId, SystemIds.NAME_PROPERTY)) {
      // Name multi-value is exact-match `in` (vs `contains` for single).
      // Different semantics, but `inInsensitive` on a fuzzy multi-search
      // would be surprising — users selecting from a list want exact matches.
      return { name: { in: values } };
    }
    return {
      values: [{ propertyId: { equals: head.columnId }, value: { in: values }, dataType: 'TEXT' }],
    };
  }

  // Other scalar dataTypes (INTEGER/FLOAT/DECIMAL/DATETIME/DATE/TIME/BOOLEAN)
  // aren't currently UI-surfaced as multi-chip filters. If we ever do, fall
  // back to OR-of-singles — the converter routes each by dataType.
  const _dataType = valueDataTypeFor(head.valueType);
  void _dataType; // referenced for future UI; suppress unused warning today
  return { OR: filters.map(f => buildSingleFilterWhere(f)) };
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    if (seen.has(input)) {
      return '[Circular]';
    }
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map(item => walk(item));
    }

    const entries = Object.entries(input).sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = walk(val);
    }
    return result;
  };

  try {
    return JSON.stringify(walk(value));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return '"[unstringifiable]"';
  }
}
