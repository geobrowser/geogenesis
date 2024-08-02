import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { Entity } from '../io/dto/entities';
import { FetchRowsOptions } from '../io/fetch-rows';
import { Services } from '../services';
import { AppEntityValue, Column, GeoType, ValueType as TripleValueType } from '../types';
import { Entities } from '../utils/entity';
import { Triples } from '../utils/triples';
import { getImagePath } from '../utils/utils';
import { Values } from '../utils/value';

export const PAGE_SIZE = 9;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

export function useTableBlock() {
  const { entityId, selectedType, spaceId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { subgraph } = Services.useServices();

  const merged = useMergedData();
  const { allActions, upsert } = useActionsStore();

  // We need to track local changes to the entity and re-fetch it when
  // any changes occur. We re-fetch instead of deriving the new entity
  // since not all of the triples for an entity will be part of the
  // actions store.
  //
  // Typicall the block will re-render if changes are made to _any_
  // triple on the block entity. This works mostly as intended except
  // when making changes to the name triple.
  //
  // We track the actions minus the name triple so we can avoid re-fetching
  // the entire block entity again when the name changes as changes to
  // the name triple should not affect any of the data fetching.
  const actionsForEntityId = React.useMemo(() => {
    return allActions.filter(t => t.entityId === entityId);
  }, [allActions, entityId]);

  const actionsForEntityIdWithoutName = React.useMemo(() => {
    return actionsForEntityId.filter(a => a.attributeId !== SYSTEM_IDS.NAME);
  }, [actionsForEntityId]);

  // We only re-fetch the block entity when actions besides changes
  // to the name triple happen. This is so we can avoid re-fetching
  // when we change the name triple as it shouldn't affect any of
  // the data fetching.
  const { data: blockEntity, isLoading } = useQuery({
    // Refetch the entity if there have been local changes
    queryKey: ['table-block-entity', entityId, actionsForEntityIdWithoutName],
    queryFn: ({ signal }) => merged.fetchEntity({ id: entityId, signal }),
  });

  // We track the name triple separately from the normal `blockEntities.triples`
  // flow so we can avoid re-rendering the block when the name changes.
  // 1. Get the initial version of the name triple if it exists. This triple can
  //    either be local or remote as we merge the local and remote triples when
  //    fetching the blockEntity.
  // 2. Since we only merge the local and remote triples when non-name triples
  //    have changed, we need to merge these with the local actions to get any
  //    up-to-date version of the name triple.
  // 3. fromActions takes _all_ the actions on the entity, so we need to filter
  //    again for the name triple. We could do this up-front as well, but the
  //    current implementation fewer data structures.
  const nameTriple = React.useMemo(() => {
    const maybeNameTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
    const mergedTriples = Triples.merge(actionsForEntityId, maybeNameTriple ? [maybeNameTriple] : []);
    return mergedTriples.find(t => t.attributeId === SYSTEM_IDS.NAME) ?? null;
  }, [blockEntity?.triples, actionsForEntityId]);

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
        async id => await merged.fetchEntity({ id })
      );

      return filterState;
    },
  });

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    // @TODO: ShownColumns changes should trigger a refetch
    queryKey: ['table-block-columns', filterState, selectedType.entityId, entityId],
    queryFn: async ({ signal }) => {
      const filterString = TableBlockSdk.createGraphQLStringFromFiltersV2(filterState ?? [], selectedType.entityId);

      const params: FetchRowsOptions['params'] = {
        filter: filterString,
        typeIds: [selectedType.entityId],
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Aggregate columns from local and server columns.
       */
      const columns = await merged.columns({
        api: {
          fetchEntity: subgraph.fetchEntity,
          fetchTriples: subgraph.fetchTriples,
        },
        params,
        signal,
      });

      const dedupedColumns = columns.reduce((acc, column) => {
        if (acc.find(c => c.id === column.id)) return acc;
        return [...acc, column];
      }, [] as Column[]);

      return dedupedColumns;
    },
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: ['table-block-rows', columns, selectedType.entityId, pageNumber, entityId, filterState],
    queryFn: async ({ signal }) => {
      if (!columns) return [];

      const filterString = TableBlockSdk.createGraphQLStringFromFiltersV2(filterState ?? [], selectedType.entityId);

      const params: FetchRowsOptions['params'] = {
        filter: filterString,
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Aggregate data for the rows from local and server entities.
       */
      const { rows } = await merged.rows(
        {
          signal,
          params,
          api: {
            fetchTableRowEntities: subgraph.fetchTableRowEntities,
          },
        },
        columns,
        selectedType.entityId
      );

      return rows;
    },
  });

  const { data: columnRelationTypes } = useQuery({
    queryKey: ['table-block-column-relation-types', columns, allActions],
    queryFn: async () => {
      if (!columns) return {};
      // 1. Fetch all attributes that are entity values
      // 2. Filter attributes that have the relation type attribute
      // 3. Return the type id and name of the relation type

      // Make sure we merge any unpublished entities
      const maybeRelationAttributeTypes = await Promise.all(
        columns.map(t => t.id).map(attributeId => merged.fetchEntity({ id: attributeId }))
      );

      const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

      // Merge all local and server triples
      const mergedTriples = Triples.merge(allActions, relationTypeEntities);

      const relationTypes = mergedTriples.filter(
        t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'ENTITY'
      );

      return relationTypes.reduce<Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>>(
        (acc, relationType) => {
          if (!acc[relationType.entityId]) acc[relationType.entityId] = [];

          acc[relationType.entityId].push({
            typeId: relationType.value.value,

            // We can safely cast here because we filter for entity type values above.
            typeName: (relationType.value as AppEntityValue).name,
            spaceId: relationType.space,
          });

          return acc;
        },
        {}
      );
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

      const entityName = Entities.name(nameTriple ? [nameTriple] : []) ?? '';

      return upsert(
        {
          type: 'SET_TRIPLE',
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
    [upsert, entityId, filterTriple, nameTriple, selectedType.entityId, spaceId]
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
    [upsert, entityId, nameTriple, spaceId]
  );

  const view = getView(blockEntity);
  const placeholder = getPlaceholder(blockEntity, view);

  return {
    blockEntity,
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

    isLoading: isLoadingColumns || isLoadingRows || isLoadingFilterState || isLoading,

    nameTriple,
    name: Values.stringValue(nameTriple ?? undefined),
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
  let image = getImagePath(DEFAULT_PLACEHOLDERS[view].image);

  if (blockEntity) {
    const placeholderTextTriple = blockEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_TEXT
    );

    if (placeholderTextTriple && placeholderTextTriple.value.type === 'TEXT') {
      text = placeholderTextTriple.value.value;
    }

    const placeholderImageTriple = blockEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_IMAGE
    );

    if (placeholderImageTriple && placeholderImageTriple.value.type === 'IMAGE') {
      image = getImagePath(placeholderImageTriple.value.value);
    }
  }

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

const TableBlockContext = React.createContext<{ entityId: string; selectedType: GeoType; spaceId: string } | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;

  selectedType?: GeoType;
  entityId: string;
}

export function TableBlockProvider({ spaceId, children, selectedType, entityId }: Props) {
  if (!selectedType) {
    // A table block might reference a type that has been deleted which will not be found
    // in the types store.
    console.error(`Undefined type in blockId: ${entityId}`);
    throw new Error('Missing selectedType in TableBlockStoreProvider');
  }

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      selectedType,
    };
  }, [spaceId, selectedType, entityId]);

  return <TableBlockContext.Provider value={store}>{children}</TableBlockContext.Provider>;
}

export function useTableBlockInstance() {
  const value = React.useContext(TableBlockContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}
