import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { FetchRowsOptions } from '../io/fetch-rows';
import { Services } from '../services';
import { Column, GeoType } from '../types';
import { Value } from '../utils/value';

interface TableBlockStoreConfig {
  spaceId: string;
}

const PAGE_SIZE = 10;

export function useTableBlockStoreV2({ spaceId }: TableBlockStoreConfig) {
  const { entityId, selectedType } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { subgraph, config } = Services.useServices();
  const merged = useMergedData();
  const { actionsByEntityId } = useActionsStore();

  const { data: blockEntity } = useQuery({
    queryKey: ['table-block-entity', entityId, actionsByEntityId[entityId]],
    queryFn: () => merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
  });

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

  console.log('table block v2', { blockEntity, nameTriple, filterTriple, filterState, rows, columns });

  return {
    blockEntity,
    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],
    filterState: filterState ?? [],

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    type: selectedType,

    isLoading: isLoadingColumns || isLoadingRows || isFilterStateLoading,
  };
}

// This component is used to wrap table blocks in the entity page
// and provide store context for the table to load and edit data
// for that specific table block.
//
// It works similarly to the EntityTableStoreProvider, but it's
// scoped specifically for table blocks since it has functionality
// unique to table blocks.
const TableBlockContext = React.createContext<{ entityId: string; selectedType: GeoType } | undefined>(undefined);

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
