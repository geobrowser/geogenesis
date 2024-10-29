import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Match } from 'effect';

import * as React from 'react';

import {
  createFiltersFromGraphQLStringAndSource,
  createGraphQLStringFromFilters,
  createGraphQLStringFromFiltersV2,
  upsertName,
} from '../blocks-sdk/table';
import { mergeEntityAsync, useEntity } from '../database/entities';
import { useRelations } from '../database/relations';
import {
  MergeTableEntitiesArgs,
  mergeCollectionItemEntitiesAsync,
  mergeColumns,
  mergeTableEntities,
} from '../database/table';
import { useWriteOps } from '../database/write';
import { Entity } from '../io/dto/entities';
import { EntityId, SpaceId } from '../io/schema';
import { ValueType as TripleValueType } from '../types';
import { EntityTable } from '../utils/entity-table';
import { getImagePath } from '../utils/utils';
import { Values } from '../utils/value';
import { getSource, removeSources, upsertSource } from './editor/sources';
import { Source } from './editor/types';

export const PAGE_SIZE = 9;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

export function useTableBlock() {
  const { entityId, spaceId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { upsert } = useWriteOps();

  const blockEntity = useEntity(React.useMemo(() => EntityId(entityId), [entityId]));

  const source: Source = React.useMemo(() => {
    return getSource(blockEntity.id, blockEntity.relationsOut, SpaceId(spaceId));
  }, [blockEntity.id, blockEntity.relationsOut, spaceId]);

  const collectionItems = useRelations(
    React.useMemo(() => {
      return {
        selector: r => {
          if (source.type !== 'COLLECTION') return false;

          // Return all local relations pointing to the collection id in the source block
          // @TODO(data blocks): Merge with any remote collection items
          return r.fromEntity.id === source.value && r.typeOf.id === EntityId(SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE);
        },
      };
    }, [source])
  );

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
    queryKey: ['table-block-filter-value', filterString, source],
    queryFn: async () => {
      const filterState = await createFiltersFromGraphQLStringAndSource(
        filterString,
        source,
        async id => await mergeEntityAsync(EntityId(id))
      );

      return filterState;
    },
  });

  // We need the entities before we can fetch the columns since we need to know the
  // types of the entities when rendering a collection source.
  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['table-block-columns', filterState],
    queryFn: async () => {
      const typesInFilter = filterState?.filter(f => f.columnId === SYSTEM_IDS.TYPES).map(f => f.value) ?? [];
      return await mergeColumns(typesInFilter);
    },
  });

  const { data: tableEntities, isLoading: isLoadingEntities } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['table-block-entities', columns, pageNumber, entityId, filterState, source, collectionItems],
    queryFn: async () => {
      if (!columns || !filterState) return [];

      const filterString = createGraphQLStringFromFiltersV2(filterState);

      const params: MergeTableEntitiesArgs['options'] = {
        filter: filterString,
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      // Depending on the source type we use different queries to aggregate the data
      // for the data view.
      return await Match.value(source).pipe(
        Match.when({ type: 'COLLECTION' }, source => mergeCollectionItemEntitiesAsync(source.value)),
        Match.when({ type: 'SPACES' }, () => mergeTableEntities({ options: params, source })),
        Match.orElse(() => [])
      );
    },
  });

  // @TODO:
  // 1) We need a way to make each row reactive to changes made locally. This eventually
  // gets rendered by table blocks, and we probably want to handle reactivity here instead
  // of doing it in the table block.
  //
  // We know the entities in the table from first time querying. Future queries need to be
  // reactive to any changes to entities in the list, however.
  //
  // 2) Alternatively we need to make render cells really cheap and let cells handle
  // calculating their own merged state. Maybe we can do this by keeping track of local state
  // of each cell and write any updates to the local state and not read the global state?
  const rows = React.useMemo(() => {
    if (!tableEntities || !columns) return [];
    return EntityTable.fromColumnsAndRows(tableEntities, columns);
  }, [tableEntities, columns]);

  const { data: columnRelationTypes } = useQuery({
    queryKey: ['table-block-column-relation-types', columns],
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
    (filters: TableBlockFilter[]) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString = newState.length === 0 ? '' : createGraphQLStringFromFilters(newState);

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
      // @TODO: This should handle setting the source based on what user selected
      removeSources({ relations: blockEntity.relationsOut, spaceId: SpaceId(spaceId) });
      upsertSource({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });
    },
    [entityId, blockEntity.relationsOut, spaceId]
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
  };
}

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY';

const getView = (blockEntity: Entity | null | undefined): DataBlockView => {
  let view: DataBlockView = 'TABLE';

  if (blockEntity) {
    const viewTriple = blockEntity.triples.find(triple => triple.attributeId === SYSTEM_IDS.VIEW_ATTRIBUTE);

    switch (viewTriple?.value.value) {
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

const TableBlockContext = React.createContext<{ entityId: string; spaceId: string } | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
}

export function TableBlockProvider({ spaceId, children, entityId }: Props) {
  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
    };
  }, [spaceId, entityId]);

  return <TableBlockContext.Provider value={store}>{children}</TableBlockContext.Provider>;
}

export function useTableBlockInstance() {
  const value = React.useContext(TableBlockContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}
