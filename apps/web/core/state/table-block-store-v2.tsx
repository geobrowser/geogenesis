import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { ID } from '../id';
import { FetchRowsOptions } from '../io/fetch-rows';
import { Services } from '../services';
import { Column, EntityValue, GeoType, TripleValueType } from '../types';
import { Entity } from '../utils/entity';
import { Triple } from '../utils/triple';
import { Value } from '../utils/value';

export const PAGE_SIZE = 10;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

export function useTableBlockStoreV2() {
  const { entityId, selectedType, spaceId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { subgraph, config } = Services.useServices();
  const merged = useMergedData();
  const { actionsByEntityId, allActions, create, update } = useActionsStore();

  const { data: blockEntity } = useQuery({
    queryKey: ['table-block-entity', entityId, actionsByEntityId[entityId]],
    queryFn: () => merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
  });

  // @TODO: Correctly memoize the references/content to blockEntity/triples
  const nameTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME) ?? null;
  }, [blockEntity?.triples]);

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  const { data: filterState, isLoading: isFilterStateLoading } = useQuery({
    queryKey: ['table-block-filter-value', filterTriple?.value],
    queryFn: async () => {
      const filterValue = Value.stringValue(filterTriple ?? undefined) ?? '';

      const filterState = TableBlockSdk.createFiltersFromGraphQLString(
        filterValue,
        async id => await merged.fetchEntity({ id, endpoint: config.subgraph })
      );

      return filterState;
    },
  });

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['table-block-columns', filterState, selectedType.entityId, entityId],
    queryFn: async ({ signal }) => {
      const filterString = filterState ? TableBlockSdk.createGraphQLStringFromFilters(filterState, entityId) : '';

      const params: FetchRowsOptions['params'] = {
        endpoint: config.subgraph,
        query: '',
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
    queryKey: ['table-block-rows', columns, selectedType.entityId, pageNumber, filterState, entityId],
    queryFn: async ({ signal }) => {
      if (!columns) return [];

      const filterString = TableBlockSdk.createGraphQLStringFromFilters(filterState ?? [], selectedType.entityId);

      const params: FetchRowsOptions['params'] = {
        endpoint: config.subgraph,
        query: '',
        filter: filterString,
        typeIds: [selectedType.entityId],
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
    queryFn: async () => {
      if (!columns) return {};
      // 1. Fetch all attributes that are entity values
      // 2. Filter attributes that have the relation type attribute
      // 3. Return the type id and name of the relation type

      // Make sure we merge any unpublished entities
      const maybeRelationAttributeTypes = await Promise.all(
        columns.map(t => t.id).map(attributeId => merged.fetchEntity({ id: attributeId, endpoint: config.subgraph }))
      );

      const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

      // Merge all local and server triples
      // @TODO: Why are we doing uniqBy? If this was for the fromActions bug it should be fixed now.
      const mergedTriples = Triple.fromActions(allActions, relationTypeEntities);

      const relationTypes = mergedTriples.filter(
        t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'entity'
      );

      return relationTypes.reduce<Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>>(
        (acc, relationType) => {
          if (!acc[relationType.entityId]) acc[relationType.entityId] = [];

          acc[relationType.entityId].push({
            typeId: relationType.value.id,

            // We can safely cast here because we filter for entity type values above.
            typeName: (relationType.value as EntityValue).name,
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

      const entityName = Entity.name(nameTriple ? [nameTriple] : []) ?? '';

      if (!filterTriple) {
        return create(
          Triple.withId({
            attributeId: SYSTEM_IDS.FILTER,
            attributeName: 'Filter',
            entityId,
            space: spaceId,
            entityName,
            value: {
              type: 'string',
              value: newFiltersString,
              id: ID.createValueId(),
            },
          })
        );
      }

      return update(
        Triple.ensureStableId({
          ...filterTriple,
          entityName,
          value: {
            ...filterTriple.value,
            type: 'string',
            value: newFiltersString,
          },
        }),
        filterTriple
      );
    },
    [create, update, entityId, filterTriple, nameTriple, selectedType.entityId, spaceId]
  );

  console.log('table block v2', {
    blockEntity,
    nameTriple,
    filterTriple,
    filterState,
    rows,
    columns,
    isLoadingColumns,
    isLoadingRows,
    isFilterStateLoading,
  });

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

    isLoading: isLoadingColumns || isLoadingRows || isFilterStateLoading,

    nameTriple,
  };
}

// This component is used to wrap table blocks in the entity page
// and provide store context for the table to load and edit data
// for that specific table block.
//
// It works similarly to the EntityTableStoreProvider, but it's
// scoped specifically for table blocks since it has functionality
// unique to table blocks.
const TableBlockContext = React.createContext<{ entityId: string; selectedType: GeoType; spaceId: string } | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;

  // @TODO: This should be type Entity
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
