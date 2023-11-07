import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { FetchRowsOptions } from '../io/fetch-rows';
import { Services } from '../services';
import { Column } from '../types';
import { Value } from '../utils/value';

interface TableBlockStoreConfig {
  spaceId: string;
  entityId: string; // entity id for the table block entity
  selectedType: {
    entityId: string;
    name: string | null;
  };
}

const PAGE_SIZE = 10;

export function useTableBlockStoreV2({ spaceId, entityId, selectedType }: TableBlockStoreConfig) {
  const [pageNumber, setPageNumber] = React.useState(0);
  const { subgraph, config } = Services.useServices();
  const merged = useMergedData();
  const { actionsByEntityId } = useActionsStore();

  const { data: blockEntity, isLoading: isLoadingBlockEntity } = useQuery({
    queryKey: ['table-block-entity', entityId, actionsByEntityId[entityId]],
    queryFn: () => merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
  });

  const nameTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME) ?? null;
  }, [blockEntity?.triples]);

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  const { data: filterState } = useQuery({
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
        typeIds: selectedType.entityId ? [selectedType.entityId] : [],
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
        typeIds: selectedType.entityId ? [selectedType.entityId] : [],
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

  console.log('table block v2', { blockEntity, nameTriple, filterTriple, filterState, rows, columns });

  return {
    blockEntity,
    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    columns: columns ?? [],
    isLoading: isLoadingBlockEntity || isLoadingColumns || isLoadingRows,
  };
}

/**
 * v1
 * {
    "endpoint": "https://api.thegraph.com/subgraphs/name/baiirun/geo",
    "query": "",
    "filter": "{typeIds_contains_nocase: [\"cb9d261d-456b-4eaf-87e5-1e9faa441867\"], entityOf_: {space: \"0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5\"}}",
    "typeIds": [
        "cb9d261d-456b-4eaf-87e5-1e9faa441867"
    ],
    "first": 11,
    "skip": 0
}

v2

{
    "endpoint": "https://api.thegraph.com/subgraphs/name/baiirun/geo",
    "query": "",
    "filter": "{typeIds_contains_nocase: [\"e1df6f0c-39ad-40fe-b2ac-8d6cff3798bc\"], entityOf_: {space: \"0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5\"}}",
    "typeIds": [
        "cb9d261d-456b-4eaf-87e5-1e9faa441867"
    ],
    "first": 11,
    "skip": 0
}
 * 
 */
