import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  Filter,
  createFilterStringFromFilters,
  createFiltersFromFilterString,
  createGraphQLStringFromFilters,
  upsertName,
} from '../blocks-sdk/table';
import { useEntity } from '../database/entities';
import { useRelations } from '../database/relations';
import {
  MergeTableEntitiesArgs,
  mergeCollectionItemEntitiesAsync,
  mergeColumns,
  mergeTableEntities,
} from '../database/table';
import { StoredRelation } from '../database/types';
import { useWriteOps } from '../database/write';
import { Entity } from '../io/dto/entities';
import { EntityId, SpaceId } from '../io/schema';
import { Schema } from '../types';
import { EntityTable } from '../utils/entity-table';
import { getImagePath } from '../utils/utils';
import { Values } from '../utils/value';
import { getSource, removeSourceType, upsertSourceType } from './editor/sources';
import { Source } from './editor/types';

export const PAGE_SIZE = 9;

interface RowQueryArgs {
  columns?: Schema[];
  pageNumber: number;
  entityId: string;
  filterState?: Awaited<ReturnType<typeof createFiltersFromFilterString>>;
  source: Source;
  collectionItems: StoredRelation[];
}

const queryKeys = {
  collectionItemEntities: (collectionItemIds: EntityId[]) =>
    ['blocks', 'data', 'collection-items', collectionItemIds] as const,
  filterState: (filterString: string | null) => ['blocks', 'data', 'filter-state', filterString] as const,
  columns: (filterState: Awaited<ReturnType<typeof createFiltersFromFilterString>> | null) =>
    ['blocks', 'data', 'columns', filterState] as const,
  rows: (args: RowQueryArgs) => ['blocks', 'data', 'rows', args],
  relationTypes: (columns?: Schema[]) => ['blocks', 'data', 'relation-types', columns],
};

export function useTableBlock() {
  const { entityId, spaceId, relationId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { upsert } = useWriteOps();

  // @TODO remove console.info for relationId
  console.info('relationId in table block:', relationId);

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  const filterString = React.useMemo(() => {
    const stringValue = Values.stringValue(filterTriple ?? undefined);

    if (stringValue && stringValue !== '') {
      return stringValue;
    }

    return null;
  }, [filterTriple]);

  /**
   * The filter state is derived from the filter string and the source. The source
   * might include a list of spaceIds to include in the filter. The filter string
   * only includes _data_ filters, but not _where_ to query from.
   */
  const { data: filterState, isLoading: isLoadingFilterState } = useQuery({
    placeholderData: keepPreviousData,
    initialData: [],
    enabled: filterString !== null,
    queryKey: queryKeys.filterState(filterString),
    queryFn: async () => {
      return await createFiltersFromFilterString(filterString);
    },
  });

  const source: Source = React.useMemo(() => {
    return getSource({
      blockId: blockEntity.id,
      dataEntityRelations: blockEntity.relationsOut,
      currentSpaceId: SpaceId(spaceId),
      filterState: filterState ?? [],
    });
  }, [blockEntity.id, blockEntity.relationsOut, spaceId, filterState]);

  const collectionItems = useRelations(
    React.useMemo(() => {
      return {
        mergeWith: blockEntity.relationsOut,
        selector: r => {
          if (source.type !== 'COLLECTION') return false;

          // Return all local relations pointing to the collection id in the source block
          // @TODO(data blocks): Merge with any remote collection items
          return r.fromEntity.id === source.value && r.typeOf.id === EntityId(SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE);
        },
      };
    }, [blockEntity.relationsOut, source])
  );

  const collectionItemIds = collectionItems?.map(c => c.toEntity.id) ?? [];

  const { data: collectionItemEntities } = useQuery({
    placeholderData: keepPreviousData,
    enabled: collectionItems.length > 0,
    queryKey: queryKeys.collectionItemEntities(collectionItemIds),
    queryFn: async () => {
      const entities = await mergeCollectionItemEntitiesAsync(collectionItemIds);

      return entities;
    },
  });

  // We need the entities before we can fetch the columns since we need to know the
  // types of the entities when rendering a collection source.
  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: queryKeys.columns(filterState ?? null),
    queryFn: async () => {
      const typesInFilter = filterState?.filter(f => f.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE).map(f => f.value) ?? [];
      return await mergeColumns(typesInFilter);
    },
  });

  const { data: tableEntities, isLoading: isLoadingEntities } = useQuery({
    enabled: columns !== undefined && filterState !== undefined,
    placeholderData: keepPreviousData,
    queryKey: queryKeys.rows({
      columns,
      pageNumber,
      collectionItems,
      entityId,
      source,
      filterState,
    }),
    queryFn: async () => {
      if (!columns || !filterState) return [];

      const filterString = createGraphQLStringFromFilters(filterState);

      const params: MergeTableEntitiesArgs['options'] = {
        filter: filterString,
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      if (source.type === 'SPACES' || source.type === 'GEO') {
        return await mergeTableEntities({ options: params, filterState });
      }

      if (source.type === 'COLLECTION') {
        return await mergeCollectionItemEntitiesAsync(collectionItems.map(c => c.toEntity.id));
      }

      return [];
    },
  });

  const rows = React.useMemo(() => {
    if (!tableEntities || !columns) return [];
    return EntityTable.fromColumnsAndRows(tableEntities, columns, collectionItemEntities);
  }, [tableEntities, columns, collectionItemEntities]);

  const { data: columnRelationTypes } = useQuery({
    placeholderData: keepPreviousData,
    enabled: columns !== undefined,
    queryKey: queryKeys.relationTypes(columns),
    queryFn: async () => {
      if (!columns) return {};
      // @TODO(database)
      return {} as Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>;
    },
  });

  const setPage = React.useCallback(
    (page: number | 'next' | 'previous') => {
      switch (page) {
        case 'next':
          setPageNumber(prev => prev + 1);
          break;
        case 'previous': {
          setPageNumber(prev => {
            if (prev - 1 < 0) return 0;
            return prev - 1;
          });
          break;
        }
        default:
          setPageNumber(page);
      }
    },
    [setPageNumber]
  );

  const setFilterState = React.useCallback(
    (filters: Filter[]) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString = newState.length === 0 ? '' : createFilterStringFromFilters(newState);

      const entityName = blockEntity.name ?? '';

      return upsert(
        {
          attributeId: SYSTEM_IDS.FILTER,
          attributeName: 'Filter',
          entityId,
          entityName,
          value: {
            type: 'TEXT',
            value: newFiltersString,
          },
        },
        spaceId
      );
    },
    [upsert, entityId, spaceId, blockEntity.name]
  );

  const setSource = React.useCallback(
    (newSource: Source) => {
      // We have three source types
      // 1. Collection
      // 2. Query
      // For each source type we need to change the source type
      // For `spaces` we need to update the filter string by setting the new
      // filter state
      // @TODO: This should handle setting the source based on what user selected
      removeSourceType({ relations: blockEntity.relationsOut, spaceId: SpaceId(spaceId) });
      upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

      if (newSource.type === 'SPACES') {
        // We only allow one space filter at a time currently, so remove any existing space filters before
        // adding the new one.
        const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER) ?? [];

        setFilterState([
          ...filtersWithoutSpaces,
          { columnId: SYSTEM_IDS.SPACE_FILTER, valueType: 'RELATION', value: newSource.value[0], valueName: null },
        ]);
      }

      if (newSource.type === 'GEO') {
        const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER) ?? [];

        setFilterState(filtersWithoutSpaces);
      }
    },
    [entityId, blockEntity.relationsOut, spaceId, setFilterState, filterState]
  );

  const setName = React.useCallback(
    (newName: string) => {
      upsertName({
        newName: newName,
        spaceId,
        entityId,
        api: { upsert },
      });
    },
    [upsert, entityId, spaceId]
  );

  const view = getView(blockEntity);
  const placeholder = getPlaceholder(blockEntity, view);

  return {
    blockEntity,
    source,
    setSource,

    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],

    columnRelationTypes: columnRelationTypes ?? {},

    filterState: filterState ?? [],
    setFilterState,

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    entityId,
    spaceId,

    isLoading: isLoadingColumns || isLoadingEntities || isLoadingFilterState,

    name: blockEntity.name,
    setName,
    view,
    placeholder,
    collectionItems,
  };
}

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY';

const getView = (blockEntity: Entity | null | undefined): DataBlockView => {
  let view: DataBlockView = 'TABLE';

  if (blockEntity) {
    const viewRelation = blockEntity.relationsOut.find(relation => relation.typeOf.id === SYSTEM_IDS.VIEW_ATTRIBUTE);

    switch (viewRelation?.toEntity.id) {
      case SYSTEM_IDS.TABLE_VIEW:
        view = 'TABLE';
        break;
      case SYSTEM_IDS.LIST_VIEW:
        view = 'LIST';
        break;
      case SYSTEM_IDS.GALLERY_VIEW:
        view = 'GALLERY';
        break;
      default:
        // We default to TABLE above
        break;
    }
  }

  return view;
};

const getPlaceholder = (blockEntity: Entity | null | undefined, view: DataBlockView) => {
  let text = DEFAULT_PLACEHOLDERS[view].text;
  // eslint-disable-next-line prefer-const
  let image = getImagePath(DEFAULT_PLACEHOLDERS[view].image);

  if (blockEntity) {
    const placeholderTextTriple = blockEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_TEXT
    );

    if (placeholderTextTriple && placeholderTextTriple.value.type === 'TEXT') {
      text = placeholderTextTriple.value.value;
    }

    // @TODO(relations): This should be a relation pointing to the image entity
    // const placeholderImageRelation = // find relation with attributeId SYSTEM_IDS.PLACEHOLDER_IMAGE
  }

  // @TODO(relations): This should be a relation pointing to the image entity
  return { text, image };
};

const DEFAULT_PLACEHOLDERS: Record<DataBlockView, { text: string; image: string }> = {
  TABLE: {
    text: 'Add an entity',
    image: '/table.png',
  },
  LIST: {
    text: 'Add a list item',
    image: '/list.png',
  },
  GALLERY: {
    text: 'Add a gallery card',
    image: '/gallery.png',
  },
};

const TableBlockContext = React.createContext<{ entityId: string; spaceId: string; relationId: string } | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
  relationId: string;
}

export function TableBlockProvider({ spaceId, children, entityId, relationId }: Props) {
  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
    };
  }, [spaceId, entityId, relationId]);

  return <TableBlockContext.Provider value={store}>{children}</TableBlockContext.Provider>;
}

export function useTableBlockInstance() {
  const value = React.useContext(TableBlockContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}
