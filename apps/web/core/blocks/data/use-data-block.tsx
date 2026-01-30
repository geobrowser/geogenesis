import { SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import { ID } from '~/core/id';
import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { sortRows } from '~/core/utils/utils';
import { Cell, Property, Relation, Row } from '~/core/v2.types';

import { useProperties } from '../../hooks/use-properties';
import { mapSelectorLexiconToSourceEntity, parseSelectorIntoLexicon } from './data-selectors';
import { Filter } from './filters';
import { Source } from './source';
import { useCollection } from './use-collection';
import { useFilters } from './use-filters';
import { Mapping, mappingToCell, mappingToRows } from './use-mapping';
import { usePagination } from './use-pagination';
import { useRelationsBlock } from './use-relations-block';
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
}

export function useDataBlock(options?: UseDataBlockOptions) {
  useRenderCounter('useDataBlock');
  const { entityId, spaceId, pageNumber, relationId, setPage } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity, isLoading: isBlockEntityLoading } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const { relationBlockSourceRelations } = useRelationsBlock();
  const { filterState: dbFilterState, isLoading: isLoadingFilterState, isFetched: isFilterStateFetched } = useFilters();

  // Use provided filter state or fall back to database filter state
  const effectiveFilterState = options?.filterState ?? dbFilterState;
  const { shownColumnIds, mapping, isLoading: isViewLoading, isFetched: isViewFetched } = useView();
  const { source } = useSource();

  const filterStateKey = React.useMemo(() => stableStringify(effectiveFilterState), [effectiveFilterState]);
  const where = React.useMemo(() => filterStateToWhere(effectiveFilterState), [filterStateKey]);

  // Fetch collection data with server-side filtering
  const {
    collectionItems,
    collectionRelations,
    isFetched: isCollectionFetched,
    isLoading: isCollectionLoading,
    collectionLength,
  } = useCollection({
    first: PAGE_SIZE,
    skip: pageNumber * PAGE_SIZE,
    where: where,
  });

  // For COLLECTION sources, server-side filtering is now applied in useCollection
  // We just need to organize the data here
  const collectionData = React.useMemo(() => {
    return {
      items: collectionItems,
      relations: collectionRelations,
      totalCount: collectionLength,
    };
  }, [collectionItems, collectionRelations, collectionLength]);

  const { entities: queriedEntities, isLoading: isQueryEntitiesLoading } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: PAGE_SIZE + 1,
    skip: pageNumber * PAGE_SIZE,
    placeholderData: keepPreviousData,
  });

  // Use the mapping to get the potential renderable properties.
  const propertiesSchema = useProperties(shownColumnIds);

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
    () => relationBlockSourceRelations.map(relation => relation.id).sort().join(','),
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
  }, [
    collectionData.items,
    collectionData.relations,
    queriedEntities,
    relationsMapping,
    shownColumnIds,
    source.type,
  ]);

  const totalPages = Math.ceil(collectionData.totalCount / PAGE_SIZE);
  const sortedRows = React.useMemo(() => sortRows(rows)?.slice(0, PAGE_SIZE) ?? [], [rows]);
  const properties = React.useMemo(() => (propertiesSchema ? Object.values(propertiesSchema) : []), [propertiesSchema]);

  const setName = (newName: string) => {
    storage.entities.name.set(entityId, spaceId, newName);
  };

  let isLoading = true;
  const isSharedDataLoading =
    isBlockEntityLoading || isLoadingFilterState || !isFilterStateFetched || isViewLoading || !isViewFetched;

  if (source.type === 'COLLECTION') {
    isLoading = isCollectionLoading || !isCollectionFetched || isSharedDataLoading;
  }

  if (source.type === 'RELATIONS') {
    isLoading = !isRelationDataFetched || isRelationDataLoading || isSharedDataLoading;
  }

  if (source.type === 'GEO' || source.type === 'SPACES') {
    isLoading = isQueryEntitiesLoading || isSharedDataLoading;
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

    name: entity?.name ?? null,
    setName,
    totalPages,
    collectionLength: collectionData.totalCount,

    relations: entity?.relations,
    collectionRelations: source.type === 'COLLECTION' ? collectionData.relations : undefined,
  };

  useDebugChanges('useDataBlock', {
    sourceType: source.type,
    sourceValue: source.type === 'COLLECTION' ? source.value : null,
    pageNumber,
    filterCount: effectiveFilterState.length,
    shownColumnsCount: shownColumnIds.length,
    mappingRef: mapping,
    whereRef: where,
    collectionItemsCount: collectionItems.length,
    collectionRelationsCount: collectionRelations.length,
    collectionLength,
    queriedEntitiesCount: queriedEntities.length,
    relationsMappingCount: relationsMapping?.length ?? 0,
    isBlockEntityLoading,
    isLoadingFilterState,
    isFilterStateFetched,
    isViewLoading,
    isViewFetched,
    isCollectionLoading,
    isCollectionFetched,
    isQueryEntitiesLoading,
    isRelationDataLoading,
    isRelationDataFetched,
  });

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
  const { pageNumber, setPage } = usePagination();

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

export function filterStateToWhere(filterState: Filter[]): WhereCondition {
  const where: WhereCondition = {};

  for (const filter of filterState) {
    if (filter.valueType === 'TEXT') {
      // For NAME_PROPERTY, filter on the entity name field directly
      if (ID.equals(filter.columnId, SystemIds.NAME_PROPERTY)) {
        where['name'] = {
          contains: filter.value,
        };
      } else {
        // For other text properties, filter on values
        if (!where.values) {
          where.values = [];
        }
        where['values'].push({
          propertyId: {
            equals: filter.columnId,
          },
          value: {
            contains: filter.value,
          },
        });
      }
    }

    if (filter.valueType === 'RELATION') {
      if (ID.equals(filter.columnId, SystemIds.SPACE_FILTER)) {
        where['spaces'] = [{ equals: filter.value }];
        continue;
      }

      if (ID.equals(filter.columnId, SystemIds.TYPES_PROPERTY)) {
        if (!where.types) {
          where.types = [];
        }
        where['types'].push({
          id: {
            equals: filter.value,
          },
        });
        continue;
      }

      if (filter.columnName === 'Backlink') {
        if (!where.backlinks) {
          where.backlinks = [];
        }

        where['backlinks'].push({
          typeOf: {
            id: {
              equals: filter.columnId,
            },
          },
          fromEntity: {
            id: {
              equals: filter.value,
            },
          },
        });
      } else {
        if (!where.relations) {
          where.relations = [];
        }

        where['relations'].push({
          typeOf: {
            id: {
              equals: filter.columnId,
            },
          },
          toEntity: {
            id: {
              equals: filter.value,
            },
          },
        });
      }
    }
  }

  return where;
}

function useRenderCounter(label: string) {
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[render] ${label} #${renderCount.current}`);
  }
}

function useDebugChanges(label: string, values: Record<string, unknown>) {
  const prevRef = React.useRef<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    const prev = prevRef.current;
    if (!prev) {
      prevRef.current = values;
      console.log(`[render] ${label} initial ${stringifyDebug(formatDebugValues(values))}`);
      return;
    }

    const changed: Record<string, { from: unknown; to: unknown }> = {};
    let hasChanges = false;

    for (const key of Object.keys(values)) {
      const prevValue = prev[key];
      const nextValue = values[key];

      if (!Object.is(prevValue, nextValue)) {
        changed[key] = { from: prevValue, to: nextValue };
        hasChanges = true;
      }
    }

    if (hasChanges) {
      console.log(`[render] ${label} changes ${stringifyDebug(formatDebugDiff(changed))}`);
    }

    prevRef.current = values;
  }, [label, values]);
}

function formatDebugValues(values: Record<string, unknown>) {
  const formatted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    formatted[key] = formatDebugValue(value);
  }
  return formatted;
}

function formatDebugDiff(diff: Record<string, { from: unknown; to: unknown }>) {
  const formatted: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(diff)) {
    formatted[key] = { from: formatDebugValue(value.from), to: formatDebugValue(value.to) };
  }
  return formatted;
}

function formatDebugValue(value: unknown) {
  if (Array.isArray(value)) {
    return {
      __type: 'array',
      length: value.length,
      preview: sanitizeDebugValue(value, 1, 10),
    };
  }
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'object') {
    return sanitizeDebugValue(value, 2, 20);
  }
  if (valueType === 'function') {
    return 'function';
  }
  return value;
}

function stringifyDebug(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return '"[unstringifiable]"';
  }
}

function sanitizeDebugValue(value: unknown, depth: number, maxArray: number) {
  const seen = new WeakSet<object>();

  const walk = (input: unknown, remainingDepth: number): unknown => {
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'function') {
        return '[Function]';
      }
      return input;
    }

    if (seen.has(input)) {
      return '[Circular]';
    }
    seen.add(input);

    if (Array.isArray(input)) {
      const preview = input.slice(0, maxArray).map(item => walk(item, remainingDepth - 1));
      return {
        __type: 'array',
        length: input.length,
        preview,
      };
    }

    if (remainingDepth <= 0) {
      return '[Object]';
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      result[key] = walk(val, remainingDepth - 1);
    }
    return result;
  };

  return walk(value, depth);
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
  } catch (_err) {
    return '"[unstringifiable]"';
  }
}
