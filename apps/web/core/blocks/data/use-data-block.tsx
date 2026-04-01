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
import { Filter, FilterMode } from './filters';
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

/** Max entities to hydrate for filter value suggestions (names, text values, relations) beyond the current table page. */
const FILTER_SUGGESTION_ENTITY_CAP = 5000;

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
  filterMode?: FilterMode;
  canEdit?: boolean;
}

export function useDataBlock(options?: UseDataBlockOptions) {
  const { entityId, spaceId, pageNumber, relationId, setPage } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity, isLoading: isBlockEntityLoading } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const {
    filterState: dbFilterState,
    resolvedFilterState: dbResolvedFilterState,
    isFilterResolving,
    filterMode: dbFilterMode,
    filterableProperties,
    setFilterState,
    setFilterMode,
    temporaryFilters,
    temporaryFilterMode,
    setTemporaryFilters,
    setTemporaryFilterMode,
  } = useFilters(options?.canEdit);

  const { source, setSource } = useSource({ filterState: dbFilterState, setFilterState });
  const { relationBlockSourceRelations } = useRelationsBlock({ source, filterState: dbFilterState });

  const activeFilterState = options?.canEdit ? dbResolvedFilterState : temporaryFilters;
  const activeFilterMode = options?.canEdit ? dbFilterMode : temporaryFilterMode;
  const effectiveFilterState = options?.filterState ?? activeFilterState;
  const effectiveFilterMode = options?.filterMode ?? activeFilterMode;
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
  const where = React.useMemo(
    () => filterStateToWhere(effectiveFilterState, effectiveFilterMode),
    [filterStateKey, effectiveFilterMode]
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
  } = useCollection({
    source,
    first: PAGE_SIZE,
    skip: pageNumber * PAGE_SIZE,
    where: where,
    sort: serverSort,
  });

  const collectionSuggestionIdSlice = React.useMemo(() => {
    if (source.type !== 'COLLECTION' || !collectionFilterSuggestionEntityIds?.length) return undefined;
    return collectionFilterSuggestionEntityIds.slice(0, FILTER_SUGGESTION_ENTITY_CAP);
  }, [source.type, collectionFilterSuggestionEntityIds]);

  useQueryEntities({
    where: { id: { in: collectionSuggestionIdSlice ?? [] } },
    enabled: Boolean(collectionSuggestionIdSlice?.length),
    first: collectionSuggestionIdSlice?.length ?? 0,
    skip: 0,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
  });

  const {
    entities: queryBlockSuggestionEntities,
    isFetched: isQueryBlockSuggestionEntitiesFetched,
  } = useQueryEntities({
    where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: FILTER_SUGGESTION_ENTITY_CAP,
    skip: 0,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
  });

  const filterSuggestionEntityIds = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      return collectionFilterSuggestionEntityIds;
    }
    if (source.type === 'SPACES' || source.type === 'GEO') {
      if (!isQueryBlockSuggestionEntitiesFetched) return undefined;
      return queryBlockSuggestionEntities.map(e => e.id);
    }
    return undefined;
  }, [
    source.type,
    collectionFilterSuggestionEntityIds,
    isQueryBlockSuggestionEntitiesFetched,
    queryBlockSuggestionEntities,
  ]);

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
  } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: PAGE_SIZE + 1,
    skip: pageNumber * PAGE_SIZE,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
    sort: serverSort,
  });

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
  // For collections, check if there are more items beyond the current page
  const hasNextPage =
    source.type === 'COLLECTION'
      ? (pageNumber + 1) * PAGE_SIZE < collectionData.totalCount
      : rows
        ? rows.length > PAGE_SIZE
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
    filterMode: effectiveFilterMode,
    dbFilterState,
    dbFilterMode,
    setFilterState,
    setFilterMode,
    filterableProperties,

    temporaryFilters,
    temporaryFilterMode,
    setTemporaryFilters,
    setTemporaryFilterMode,

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
  setPage: (page: number | 'next' | 'previous') => void;
} | null>(null);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
  relationId: string;
}

export function DataBlockProvider({ spaceId, children, entityId, relationId }: Props) {
  const { pageNumber, setPage } = usePagination(entityId);

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
      pageNumber,
      setPage,
    };
  }, [spaceId, entityId, relationId, pageNumber, setPage]);

  return <DataBlockContext.Provider value={store}>{children}</DataBlockContext.Provider>;
}

export function useDataBlockInstance() {
  const context = React.useContext(DataBlockContext);

  if (context === null) {
    throw new Error(`Missing DataBlockProvider`);
  }

  return context;
}

export function filterStateToWhere(filterState: Filter[], mode: FilterMode = 'AND'): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  // Group filters by columnId so we can AND between groups and apply
  // the user-chosen mode (AND/OR) only within each group.
  const groups = new Map<string, Filter[]>();
  for (const f of filterState) {
    const key = f.columnId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const groupConditions: WhereCondition[] = [];
  for (const [, filters] of groups) {
    if (filters.length === 1) {
      groupConditions.push(buildSingleFilterWhere(filters[0]));
    } else if (mode === 'OR') {
      groupConditions.push(buildOrWhere(filters));
    } else {
      groupConditions.push(buildAndWhere(filters));
    }
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

function buildSingleFilterWhere(f: Filter): WhereCondition {
  if (f.valueType === 'TEXT') {
    if (ID.equals(f.columnId, SystemIds.NAME_PROPERTY)) {
      return { name: { contains: f.value } };
    }
    return {
      values: [{ propertyId: { equals: f.columnId }, value: { contains: f.value } }],
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

function buildOrWhere(filterState: Filter[]): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  return {
    OR: filterState.map(f => buildSingleFilterWhere(f)),
  };
}

function buildAndWhere(filterState: Filter[]): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  // Wrap each filter in AND so ALL conditions must match.
  // We use individual sub-conditions (via buildSingleFilterWhere) rather than
  // merging into one flat object, because the local query engine's matchesCondition
  // returns early when it sees AND/OR — mixing AND with other fields on the same
  // object would skip those fields. Using AND: [...] also correctly handles types
  // and spaces which need per-condition evaluation for true AND semantics.
  return { AND: filterState.map(f => buildSingleFilterWhere(f)) };
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
