import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

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

// Helper function to check if a row matches the filter criteria
function rowMatchesFilters(row: Row, filterState: Filter[]): boolean {
  return filterState.every(filter => {
    const cell = row.columns[filter.columnId];
    if (!cell) return false;

    if (filter.valueType === 'TEXT') {
      return cell.name?.toLowerCase().includes(filter.value.toLowerCase()) || false;
    }

    if (filter.valueType === 'RELATION') {
      return cell.name?.toLowerCase().includes(filter.value.toLowerCase()) || false;
    }

    return false;
  });
}

export const PAGE_SIZE = 9;

interface RenderablesQueryKey {
  source: Source;
  mapping: Mapping;
  spaceId: string;
  sourceEntityRelations: Relation[];
}

const queryKeys = {
  relationQuery: (args: RenderablesQueryKey) => ['blocks', 'data', 'renderables', args],
  columnsSchema: (columns?: Property[]) => ['blocks', 'data', 'columns-schema', columns],
};

interface UseDataBlockOptions {
  filterState?: Filter[];
}

export function useDataBlock(options?: UseDataBlockOptions) {
  const { entityId, spaceId, pageNumber, relationId, setPage } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity, isLoading: isBlockEntityLoading } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const { relationBlockSourceRelations } = useRelationsBlock();
  const { filterState: dbFilterState, isLoading: isLoadingFilterState, isFetched: isFilterStateFetched } = useFilters();

  // Use provided filter state or fall back to database filter state
  const filterState = options?.filterState ?? dbFilterState;
  const { shownColumnIds, mapping, isLoading: isViewLoading, isFetched: isViewFetched } = useView();
  const { source } = useSource();

  // Fetch collection data
  // For COLLECTION sources with filters, fetch PAGE_SIZE items from start for client-side filtering
  const {
    collectionItems,
    collectionRelations,
    isFetched: isCollectionFetched,
    isLoading: isCollectionLoading,
    collectionLength,
  } = useCollection({
    first: PAGE_SIZE,
    skip: source.type === 'COLLECTION' && filterState.length > 0 ? 0 : pageNumber * PAGE_SIZE,
  });

  // Filter and paginate collection items
  const collectionData = React.useMemo(() => {
    if (source.type !== 'COLLECTION') {
      return {
        items: collectionItems,
        relations: collectionRelations,
        totalCount: collectionLength,
      };
    }

    // No filters: use regular pagination
    if (filterState.length === 0) {
      return {
        items: collectionItems,
        relations: collectionRelations,
        totalCount: collectionLength,
      };
    }

    // With filters: apply client-side filtering, then paginate
    const rows = mappingToRows(collectionItems, shownColumnIds, collectionRelations);
    const filteredRows = rows.filter(row => rowMatchesFilters(row, filterState));

    // Get filtered entity IDs
    const filteredEntityIds = new Set(filteredRows.map(r => r.entityId));
    const filteredRelations = collectionRelations.filter(r => filteredEntityIds.has(r.toEntity.id));
    const filteredItems = collectionItems.filter(item => filteredEntityIds.has(item.id));

    // Apply pagination to filtered results
    const startIndex = pageNumber * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const paginatedRelations = filteredRelations.slice(startIndex, endIndex);
    const paginatedItems = filteredItems.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      relations: paginatedRelations,
      totalCount: filteredRelations.length,
    };
  }, [source.type, filterState, collectionItems, collectionRelations, shownColumnIds, pageNumber, collectionLength]);

  const where = filterStateToWhere(filterState);

  const { entities: queriedEntities, isLoading: isQueryEntitiesLoading } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    first: PAGE_SIZE + 1,
    skip: pageNumber * PAGE_SIZE,
    placeholderData: keepPreviousData,
  });

  // Use the mapping to get the potential renderable properties.
  const propertiesSchema = useProperties(shownColumnIds);

  const {
    data: relationsMapping,
    isLoading: isRelationDataLoading,
    isFetched: isRelationDataFetched,
  } = useQuery({
    enabled: source.type === 'RELATIONS',
    placeholderData: keepPreviousData,
    // @TODO: Should re-run when the relations for the entity source changes
    queryKey: queryKeys.relationQuery({
      source,
      mapping,
      spaceId,
      sourceEntityRelations: relationBlockSourceRelations,
    }),
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
  const rows = (() => {
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
  })();

  const totalPages = Math.ceil(collectionData.totalCount / PAGE_SIZE);

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
    rows: sortRows(rows)?.slice(0, PAGE_SIZE) ?? [],
    properties: propertiesSchema ? Object.values(propertiesSchema) : [],
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
      if (!where.values) {
        where.values = [];
      }

      where['values'].push({
        propertyId: {
          equals: filter.columnId,
        },
        value: {
          equals: filter.value,
        },
      });
    }

    if (filter.valueType === 'RELATION') {
      if (filter.columnId === SystemIds.SPACE_FILTER) {
        where['spaces'] = [{ equals: filter.value }];
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
