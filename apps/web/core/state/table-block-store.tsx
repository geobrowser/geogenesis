import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { mergeEntityAsync, useEntity } from '../database/entities';
import { MergeTableEntitiesArgs, mergeColumns, mergeTableEntities } from '../database/table';
import { useWriteOps } from '../database/write';
import { Entity } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { GeoType, ValueType as TripleValueType } from '../types';
import { EntityTable } from '../utils/entity-table';
import { Values } from '../utils/value';

export const PAGE_SIZE = 9;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

type SpaceId = string;

type SingleSource = {
  type: 'collection' | 'geo';
  value: string;
};

// @TODO add support for `collections` with multiple `collectionId`s
type MultipleSources = {
  type: 'spaces';
  value: Array<SpaceId>;
};

type Source = SingleSource | MultipleSources;

export function useTableBlock() {
  const { entityId, spaceId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { upsert } = useWriteOps();

  // @TODO(collections): Don't need type anymore as this
  // should be derived from the query string
  const selectedType: GeoType = {
    entityId: '',
    entityName: '',
    space: '',
  };

  const blockEntity = useEntity(React.useMemo(() => EntityId(entityId), [entityId]));

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  // We memoize the filterString since several of the subsequent queries rely
  // on the graphql representation of the filter. Memoizing it means we avoid
  // unnecessary re-renders.
  const filterString = React.useMemo(() => {
    const stringValue = Values.stringValue(filterTriple ?? undefined);

    if (stringValue && stringValue !== '') {
      return stringValue;
    }

    return TableBlockSdk.createGraphQLStringFromFiltersV2([], selectedType.entityId);
  }, [filterTriple, selectedType.entityId]);

  const { data: filterState, isLoading: isLoadingFilterState } = useQuery({
    queryKey: ['table-block-filter-value', filterString],
    queryFn: async () => {
      const filterState = TableBlockSdk.createFiltersFromGraphQLString(
        filterString,
        async id => await mergeEntityAsync(EntityId(id))
      );

      return filterState;
    },
  });

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['table-block-columns', selectedType.entityId],
    queryFn: async () => {
      return await mergeColumns(EntityId(selectedType.entityId));
    },
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: ['table-block-rows', columns, selectedType.entityId, pageNumber, entityId, filterState],
    queryFn: async () => {
      if (!columns) return [];

      const filterString = TableBlockSdk.createGraphQLStringFromFiltersV2(filterState ?? [], selectedType.entityId);

      const params: MergeTableEntitiesArgs['options'] = {
        filter: filterString,
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Aggregate data for the rows from local and server entities.
       */
      const entities = await mergeTableEntities({
        options: params,
        selectedTypeId: EntityId(selectedType.entityId),
      });

      return EntityTable.fromColumnsAndRows(entities, columns).rows;
    },
  });

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
      const newFiltersString =
        newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, selectedType.entityId);

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
    [upsert, entityId, selectedType.entityId, spaceId, blockEntity.name]
  );

  const setName = React.useCallback(
    (newName: string) => {
      TableBlockSdk.upsertName({
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

  let source: Source = {
    type: 'collection',
    value: '',
  };

  // required to coerce returned source type to `Source`
  // @TODO replace with proper logic for collection blocks
  const isCollection = false;
  if (isCollection) {
    source = {
      type: 'collection',
      value: 'MOCK_COLLECTION_ID',
    };
  }

  if (filterState && filterState.find(filter => filter.columnId === SYSTEM_IDS.SPACE)) {
    const spaces = filterState.filter(filter => filter.columnId === SYSTEM_IDS.SPACE).map(filter => filter.value);

    source = {
      type: 'spaces',
      value: spaces,
    };
  }

  return {
    blockEntity,
    source,

    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],

    columnRelationTypes: columnRelationTypes ?? {},

    filterState: filterState ?? [],
    setFilterState,

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    type: selectedType,
    entityId,
    spaceId,

    isLoading: isLoadingColumns || isLoadingRows || isLoadingFilterState,

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
  // let image = getImagePath(DEFAULT_PLACEHOLDERS[view].image);

  if (blockEntity) {
    const placeholderTextTriple = blockEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_TEXT
    );

    if (placeholderTextTriple && placeholderTextTriple.value.type === 'TEXT') {
      text = placeholderTextTriple.value.value;
    }

    // @TODO(relations): This should be a relation pointing to the image entity
    // const placeholderImageTriple = blockEntity.triples.find(
    //   triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_IMAGE
    // );

    // if (placeholderImageTriple && placeholderImageTriple.value.type === 'IMAGE') {
    //   image = getImagePath(placeholderImageTriple.value.value);
    // }
  }

  // @TODO(relations): This should be a relation pointing to the image entity
  return { text, image: '' };
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
