'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { MergeTableEntitiesArgs, mergeTableEntities } from '~/core/database/table';
import { useWriteOps } from '~/core/database/write';
import { createType as insertType } from '~/core/type/create-type';
import { GeoType, Triple as TripleType, ValueType as TripleValueType } from '~/core/types';
import { EntityTable } from '~/core/utils/entity-table';

import { useEntityTableStoreInstance } from './entity-table-store-provider';

export const DEFAULT_PAGE_SIZE = 10;

const queryAtom = atom('');
const pageNumberAtom = atom(0);
const selectedTypeAtom = atom<GeoType | null>(null);

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

export function useEntityTable() {
  const { initialSelectedType, spaceId } = useEntityTableStoreInstance();
  const { upsert } = useWriteOps();

  const [query, setQuery] = useAtom(queryAtom);
  const [pageNumber, setPageNumber] = useAtom(pageNumberAtom);
  const [selectedType, setSelectedType] = useAtom(selectedTypeAtom);

  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!selectedType) {
      setSelectedType(initialSelectedType);
    }
  }, [initialSelectedType, setSelectedType, selectedType]);

  const filterString = TableBlockSdk.createGraphQLStringFromFilters([
    {
      columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
      value: query,
      valueType: 'TEXT',
    },
    // Only return rows that are in the current space
    {
      columnId: SYSTEM_IDS.SPACE_FILTER,
      value: spaceId,
      valueType: 'TEXT',
    },
  ]);

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['table-block-columns', selectedType?.entityId],
    queryFn: async () => {
      if (!selectedType) return [];
      return [];
      // return await mergeColumns(EntityId(selectedType.entityId));
    },
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: ['table-block-rows', columns, pageNumber, filterString, spaceId],
    queryFn: async () => {
      if (!columns || !selectedType) return [];

      const params: MergeTableEntitiesArgs['options'] = {
        filter: filterString,
        first: DEFAULT_PAGE_SIZE + 1,
        skip: pageNumber * DEFAULT_PAGE_SIZE,
      };

      /**
       * Aggregate data for the rows from local and server entities.
       */
      const entities = await mergeTableEntities({
        options: params,
        filterState: [],
      });

      hydrated.current = true;
      return EntityTable.fromColumnsAndRows(entities, columns);
    },
  });

  const { data: columnRelationTypes } = useQuery({
    queryKey: ['table-block-column-relation-types', columns],
    queryFn: async () => {
      if (!columns) return {};
      // @TODO(database)
      return {};
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

  const createForeignType = (foreignType: TripleType) => {};

  const createType = (entityName: string) => {
    return insertType(entityName, spaceId, upsert);
  };

  return {
    query,
    setQuery,

    rows: rows?.slice(0, DEFAULT_PAGE_SIZE) ?? [],
    columns: columns ?? [],
    unpublishedColumns: [],
    columnRelationTypes: columnRelationTypes ?? {},

    pageNumber,
    hasNextPage: rows ? rows?.length > DEFAULT_PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    selectedType,
    setSelectedType,

    hydrated: !(isLoadingColumns || isLoadingRows),

    createType,
    createForeignType,
  };
}
