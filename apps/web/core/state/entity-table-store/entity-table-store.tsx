'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { mergeEntityAsync } from '~/core/database/entities';
import { MergeTableEntitiesArgs, mergeColumns, mergeTableEntities } from '~/core/database/table';
import { useWriteOps } from '~/core/database/write';
import { EntityId } from '~/core/io/schema';
import { createForeignType as insertForeignType, createType as insertType } from '~/core/type/create-type';
import { AppEntityValue, GeoType, Triple as TripleType, ValueType as TripleValueType } from '~/core/types';
import { EntityTable } from '~/core/utils/entity-table';
import { Triples } from '~/core/utils/triples';

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
  const { space, initialSelectedType, spaceId } = useEntityTableStoreInstance();
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

  const filterString = TableBlockSdk.createGraphQLStringFromFilters(
    [
      {
        columnId: SYSTEM_IDS.NAME,
        value: query,
        valueType: 'TEXT',
      },
      // Only return rows that are in the current space
      {
        columnId: SYSTEM_IDS.SPACE,
        value: spaceId,
        valueType: 'TEXT',
      },
    ],
    selectedType?.entityId ?? null
  );

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['table-block-columns', selectedType?.entityId],
    queryFn: async () => {
      if (!selectedType) return [];
      return await mergeColumns(EntityId(selectedType.entityId));
    },
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: ['table-block-rows', columns, selectedType?.entityId, pageNumber, filterString],
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
        selectedTypeId: EntityId(selectedType.entityId),
      });

      hydrated.current = true;
      return EntityTable.fromColumnsAndRows(entities, columns).rows;
    },
  });

  // @TODO(database)
  const { data: columnRelationTypes } = useQuery({
    // @ts-expect-error @TODO(database)
    queryKey: ['table-block-column-relation-types', columns, allActions],
    queryFn: async () => {
      if (!columns) return {};
      // 1. Fetch all attributes that are entity values
      // 2. Filter attributes that have the relation type attribute
      // 3. Return the type id and name of the relation type

      // Make sure we merge any unpublished entities
      const maybeRelationAttributeTypes = await Promise.all(
        columns.map(t => t.id).map(attributeId => mergeEntityAsync(EntityId(attributeId)))
      );

      const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

      // Merge all local and server triples
      // @ts-expect-error @TODO(database)
      const mergedTriples = Triples.merge(allActions, relationTypeEntities);

      // @TODO(relations)
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

  const createForeignType = (foreignType: TripleType) => {
    insertForeignType(foreignType, spaceId, space?.spaceConfig?.id ?? null, upsert);
  };

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
