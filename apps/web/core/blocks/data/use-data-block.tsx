import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Cell, Property, Row } from '~/core/types';
import { propertyForSort, shouldIncludeWithoutValueForPropertySort } from '~/core/utils/column-sort';
import { sortRows } from '~/core/utils/utils';

import { useProperties } from '../../hooks/use-properties';
import { DEFAULT_DATA_BLOCK_PAGE_SIZE } from './block-ontology-ids';
import { mapSelectorLexiconToSourceEntity, parseSelectorIntoLexicon } from './data-selectors';
import { filterStateToWhere } from './filter-state-to-where';
import { Filter, ModesByColumn } from './filters';
import { Source } from './source';
import { useBlockPageSize } from './use-block-page-size';
import { useCollection } from './use-collection';
import { useDropdownQueryOverlay } from './use-dropdown-query-overlay';
import { useFilters } from './use-filters';
import { mappingToCell, mappingToRows } from './use-mapping';
import { usePagination } from './use-pagination';
import { useRelationsBlock } from './use-relations-block';
import { useSort } from './use-sort';
import { useSource } from './use-source';
import { useView } from './use-view';

export { filterStateToWhere } from './filter-state-to-where';

/** Default when no Page size is set on the block relation. Prefer `useDataBlock().pageSize`. */
export const PAGE_SIZE = DEFAULT_DATA_BLOCK_PAGE_SIZE;

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

  const { entity, isLoading: isBlockEntityHydrating } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  // `useQueryEntity` stays loading until its remote hydration settles, even when the
  // entity already resolves from the local store. A block the user just created exists
  // only locally, so that fetch comes back empty and the skeleton would show for the
  // length of it.
  const isBlockEntityLoading = isBlockEntityHydrating && !entity;

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

  // Feed the resolved (names-included) state in so `setSource`'s produce()
  // round-trip preserves columnName/valueName on the OTHER filters while the
  // new filter list is being re-resolved.
  const { source, setSource } = useSource({ filterState: dbResolvedFilterState, setFilterState });
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
    orderedShownColumnRelations,
    toggleProperty,
    hideAllShownPropertyColumns,
    reorderShownPropertyRelations,
  } = useView();

  const { sortState, setSortState } = useSort(options?.canEdit);
  const pageSize = useBlockPageSize();

  // Browse-mode personal dropdowns overlay the effective filter state for
  // the QUERY only: the block's filters, pills, and edit flows never see
  // them. All gating lives in the shared hook.
  const isEditing = useUserIsEditing(spaceId);
  // Shown-column schema entries (e.g. Cover) can be missing from
  // filterableProperties; the pills offer them, so the overlay must too.
  const propertiesSchema = useProperties(shownColumnIds, spaceId);
  const schemaProperties = React.useMemo(
    () => (propertiesSchema ? Object.values(propertiesSchema) : []),
    [propertiesSchema]
  );
  const {
    queryFilterState,
    queryModesByColumn,
    browseDropdowns: overlayBrowseDropdowns,
  } = useDropdownQueryOverlay({
    source,
    isEditing,
    baseFilterState: effectiveFilterState,
    baseModesByColumn: effectiveModesByColumn,
    filterableProperties,
    extraPillProperties: schemaProperties,
  });

  const filterStateKey = React.useMemo(() => stableStringify(queryFilterState), [queryFilterState]);
  const filterModesKey = React.useMemo(() => stableStringify(queryModesByColumn), [queryModesByColumn]);
  const where = React.useMemo(() => {
    // Rehydrate from the content keys so equivalent arrays/maps retain the
    // same WhereCondition reference even when their input identities change.
    const stableFilterState = JSON.parse(filterStateKey) as Filter[];
    const stableModesByColumn = JSON.parse(filterModesKey) as ModesByColumn;
    return filterStateToWhere(stableFilterState, stableModesByColumn);
  }, [filterStateKey, filterModesKey]);

  /**
   * The query's own identity. Deliberately derived from `where` rather than `filterStateKey`:
   * `effectiveFilterState` also carries `columnName`/`valueName`, which `resolveFilterDisplayNames`
   * fills in asynchronously and `filterStateToWhere` discards. Keying off the filter state would
   * make a name resolving from `null` to a string look like a new query.
   */
  const whereKey = React.useMemo(() => stableStringify(where), [where]);
  // Map sortState to server-side sort params — used by all source types.
  // dataType is required by the backend's entitiesOrderedByProperty SQL function
  // to resolve which value column to sort on.
  // Look up from shown columns first, then fall back to all filterable properties
  // (allows sorting by properties not currently visible in the table).
  const serverSort = React.useMemo(() => {
    if (!sortState) return undefined;
    const property = propertyForSort(sortState.columnId, [
      ...(propertiesSchema ? Object.values(propertiesSchema) : []),
      ...filterableProperties,
    ]);
    return {
      propertyId: sortState.columnId,
      direction: sortState.direction,
      dataType: property?.dataType?.toLowerCase(),
      includeWithoutValue: shouldIncludeWithoutValueForPropertySort(sortState.columnId),
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
    first: pageSize,
    pageNumber,
    after: currentAfter,
    offset: currentOffset !== undefined ? currentOffset * pageSize : undefined,
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
    error: queriedError,
    refetch: refetchQueriedEntities,
  } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: pageSize,
    after: currentAfter,
    offset: currentOffset !== undefined ? currentOffset * pageSize : undefined,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
    includeUnpublishedLocal: true,
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
    const key = `${filterStateKey}::${sortKey}::${pageSize}`;
    if (lastResetKeyRef.current !== null && lastResetKeyRef.current !== key) {
      resetPagination();
    }
    lastResetKeyRef.current = key;
  }, [filterStateKey, sortKey, pageSize, resetPagination]);

  const totalPages = Math.ceil(collectionData.totalCount / pageSize);
  const sortedRows = React.useMemo(
    () => (sortState ? rows.slice(0, pageSize) : (sortRows(rows)?.slice(0, pageSize) ?? [])),
    [pageSize, rows, sortState]
  );
  const properties = React.useMemo(() => {
    if (!propertiesSchema) return [];
    return shownColumnIds.map(id => propertiesSchema[id]).filter((p): p is Property => Boolean(p));
  }, [propertiesSchema, shownColumnIds]);

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
        : (pageNumber + 1) * pageSize < collectionData.totalCount
      : source.type === 'GEO' || source.type === 'SPACES'
        ? queriedHasNextPage
        : false;

  const isPlaceholderData =
    source.type === 'COLLECTION'
      ? isCollectionPlaceholder
      : source.type === 'GEO' || source.type === 'SPACES'
        ? isQueryEntitiesPlaceholder
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
    pageSize,
    hasNextPage,
    hasPreviousPage: pageNumber > 0,
    setPage,
    canJumpTo,
    maxJumpPages,

    isLoading,
    isFetched,
    isPlaceholderData,

    /**
     * A failed remote fetch settles as `isFetched`, so callers rendering an empty state need this
     * to tell "nothing matched" from "the query never came back".
     *
     * Source-scoped like `isFetched`/`hasNextPage` above, and for the same reason: the entities
     * query is keyed purely on its content, so two blocks with identical `where`/page/sort share a
     * cache entry. Without this scoping a COLLECTION or RELATIONS block would report the failure of
     * an unrelated GEO block that happened to issue the same query.
     *
     * The corollary is that only GEO/SPACES blocks can report a failure at all. A COLLECTION block
     * with infinite scroll on whose page fetch fails still stops silently — `useCollection` has no
     * error surface to forward. Fixing that means giving it one.
     */
    error: source.type === 'GEO' || source.type === 'SPACES' ? queriedError : null,
    /** Retry after `error` — without it a failed fetch reads as "fetched, zero results" forever. */
    refetch: source.type === 'GEO' || source.type === 'SPACES' ? refetchQueriedEntities : undefined,

    /**
     * The serialized query identity. Exposed so callers caching derived per-query state can
     * invalidate on exactly what the query keys on, rather than re-deriving a projection of the
     * filter/sort state that can silently drift from it.
     */
    whereKey,
    sortKey,

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
    orderedShownColumnRelations,
    toggleProperty,
    hideAllShownPropertyColumns,
    reorderShownPropertyRelations,

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

    // Browse-mode personal dropdowns
    browseDropdowns: {
      ...overlayBrowseDropdowns,
      baseFilterState: effectiveFilterState,
      baseModesByColumn: effectiveModesByColumn,
    },

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
  knownSourceType: Source['type'] | undefined;
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
  /** Lets `useSource` resolve a freshly inserted block before its source relation is written. */
  knownSourceType?: Source['type'];
}

export function DataBlockProvider({ spaceId, children, entityId, relationId, knownSourceType }: Props) {
  const { pageNumber, currentAfter, currentOffset, setPage, recordEndCursor, reset, canJumpTo, maxJumpPages } =
    usePagination(entityId);

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
      knownSourceType,
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
    knownSourceType,
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
