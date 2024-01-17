import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { FetchRowsOptions } from '~/core/io/fetch-rows';
import { Services } from '~/core/services';
import { createForeignType as insertForeignType, createType as insertType } from '~/core/type/create-type';
import { Column, EntityValue, GeoType, Triple as TripleType, TripleValueType } from '~/core/types';
import { EntityTable } from '~/core/utils/entity-table';
import { Triple } from '~/core/utils/triple';

import { useLocalStore } from '../local-store';
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
  const { subgraph, config } = Services.useServices();
  const { space, initialSelectedType, spaceId } = useEntityTableStoreInstance();
  const { triples } = useLocalStore();
  const merged = useMergedData();
  const { allActions, create } = useActionsStore();

  const [query, setQuery] = useAtom(queryAtom);
  const [pageNumber, setPageNumber] = useAtom(pageNumberAtom);
  const [selectedType, setSelectedType] = useAtom(selectedTypeAtom);

  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!selectedType) {
      setSelectedType(initialSelectedType);
    }
  }, [initialSelectedType, setSelectedType, selectedType]);

  const filterString = TableBlockSdk.createGraphQLStringFromFilters(
    [
      {
        columnId: SYSTEM_IDS.NAME,
        value: query,
        valueType: 'string',
      },
      // Only return rows that are in the current space
      {
        columnId: SYSTEM_IDS.SPACE,
        value: spaceId,
        valueType: 'string',
      },
    ],
    selectedType?.entityId ?? null
  );

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    // @TODO: ShownColumns changes should trigger a refetch
    queryKey: ['entity-table-columns', selectedType?.entityId, filterString],
    queryFn: async ({ signal }) => {
      const params: FetchRowsOptions['params'] = {
        query: '',
        filter: filterString,
        typeIds: selectedType ? [selectedType.entityId] : [],
        first: DEFAULT_PAGE_SIZE + 1,
        skip: pageNumber * DEFAULT_PAGE_SIZE,
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
    queryKey: ['table-block-rows', columns, selectedType?.entityId, pageNumber, filterString],
    queryFn: async ({ signal }) => {
      if (!columns) return [];

      const params: FetchRowsOptions['params'] = {
        query: '',
        filter: filterString,
        typeIds: selectedType ? [selectedType.entityId] : [],
        first: DEFAULT_PAGE_SIZE + 1,
        skip: pageNumber * DEFAULT_PAGE_SIZE,
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
        selectedType?.entityId
      );

      hydrated.current = true;

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

  const unpublishedColumns = React.useMemo(() => {
    return EntityTable.columnsFromLocalChanges(triples, [], selectedType?.entityId);
  }, [selectedType?.entityId, triples]);

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

  const createForeignType = (foreignType: TripleType) => {
    insertForeignType(foreignType, spaceId, space?.spaceConfig?.id ?? null, create);
  };

  const createType = (entityName: string) => {
    return insertType(entityName, spaceId, create);
  };

  return {
    query,
    setQuery,

    rows: rows?.slice(0, DEFAULT_PAGE_SIZE) ?? [],
    columns: columns ?? [],
    unpublishedColumns,
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
