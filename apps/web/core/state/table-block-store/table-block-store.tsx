'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { Observable, ObservableComputed, batch, computed, observable } from '@legendapp/state';
import { observe } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A } from '@mobily/ts-belt';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { Environment } from '~/core/environment';
import { useGeoSelector } from '~/core/hooks/use-selector';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { FetchRowsOptions } from '~/core/io/fetch-rows';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { ActionsStore, useActionsStoreInstance } from '~/core/state/actions-store';
import { SelectedEntityType } from '~/core/state/entity-table-store';
import { Column, EntityValue, Entity as IEntity, Triple as ITriple, Row, TripleValueType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { EntityTable } from '~/core/utils/entity-table';
import { Triple } from '~/core/utils/triple';
import { makeOptionalComputed } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { LocalStore, useLocalStoreInstance } from '../local-store';
import { entityTriplesSelector } from '../utils';

export const PAGE_SIZE = 10;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

const TableBlockStoreContext = createContext<
  | {
      spaceId: string;
      entityId: string;
      type?: SelectedEntityType;
    }
  | undefined
>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;

  // @TODO: This should be type Entity
  selectedType?: SelectedEntityType;
  entityId: string;
}

// This component is used to wrap table blocks in the entity page
// and provide store context for the table to load and edit data
// for that specific table block.
//
// It works similarly to the EntityTableStoreProvider, but it's
// scoped specifically for table blocks since it has functionality
// unique to table blocks.
export function TableBlockStoreProvider({ spaceId, children, selectedType, entityId }: Props) {
  if (!selectedType) {
    // A table block might reference a type that has been deleted which will not be found
    // in the types store.
    console.error(`Undefined type in blockId: ${entityId}`);
    throw new Error('Missing selectedType in TableBlockStoreProvider');
  }

  const tableBlockConfig = React.useMemo(
    () => ({
      spaceId,
      entityId,
      type: selectedType,
    }),
    [spaceId, entityId, selectedType]
  );

  return <TableBlockStoreContext.Provider value={tableBlockConfig}>{children}</TableBlockStoreContext.Provider>;
}

export function useTableBlockStoreInstance() {
  const value = useContext(TableBlockStoreContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}

// @NOTE: Right now we don't need to set page number, name triple, or filter state as global state derived
// in this hook. This is because those pieces of state are only consumed in one place at a time in the
// table block component tree.
export function useTableBlock() {
  const { spaceId, entityId, type } = useTableBlockStoreInstance();
  const localTriplesForEntityId = useGeoSelector(state => entityTriplesSelector(state, entityId));
  const localStore = useLocalStoreInstance();
  const store = useActionsStoreInstance();

  // @NOTE: Right now we don't need to set page number, name triple, or filter state as global state derived
  // in this hook. This is because those pieces of state are only consumed in one place at a time in the
  // table block component tree.
  const [pageNumber, setPageNumber] = React.useState(0);

  const { subgraph, config } = Services.useServices();
  const merged = React.useMemo(() => new Merged({ localStore, subgraph, store }), [localStore, store, subgraph]);

  const { data: blockEntity, isLoading: isLoadingBlockEntity } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: ({ signal }) => subgraph.fetchEntity({ id: entityId, endpoint: config.subgraph, signal }),
  });

  const localNameTriple = localTriplesForEntityId?.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const serverNameTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
  const nameTriple = localNameTriple ?? serverNameTriple ?? null;

  const localFilterTriple = localTriplesForEntityId?.find(t => t.attributeId === SYSTEM_IDS.FILTER);
  const serverTripleFilter = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER);
  const filterTriple = localFilterTriple ?? serverTripleFilter ?? null;

  const filterValue = Value.stringValue(filterTriple ?? undefined) ?? '';

  const { data: filterState, isLoading: isLoadingFilterState } = useQuery({
    queryKey: ['filterState in table block', entityId, filterValue],
    queryFn: () =>
      TableBlockSdk.createFiltersFromGraphQLString(
        filterValue,
        async id => await merged.fetchEntity({ id, endpoint: config.subgraph })
      ),
  });

  const filterString = TableBlockSdk.createGraphQLStringFromFilters(filterState ?? null, type?.entityId ?? null);

  const params: FetchRowsOptions['params'] = {
    endpoint: config.subgraph,
    query: '',
    filter: filterString,
    typeIds: type?.entityId ? [type.entityId] : [],
    first: PAGE_SIZE + 1,
    skip: pageNumber * PAGE_SIZE,
  };

  /**
   * Aggregate columns from local and server columns.
   */
  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: [
      'columns in table block',
      entityId,
      params.filter,
      params.first,
      params.query,
      params.skip,
      params.typeIds,
    ],
    queryFn: ({ signal }) =>
      merged.columns({
        api: {
          fetchEntity: subgraph.fetchEntity,
          fetchTriples: subgraph.fetchTriples,
        },
        params,
        signal,
      }),
  });

  const dedupedColumns =
    columns?.reduce((acc, column) => {
      if (acc.find(c => c.id === column.id)) return acc;
      return [...acc, column];
    }, [] as Column[]) ?? [];

  /**
   * Aggregate data for the rows from local and server entities.
   */
  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: [
      'rows in table block',
      entityId,
      params.filter,
      params.first,
      params.query,
      params.skip,
      params.typeIds,
      type?.entityId,
      dedupedColumns,
    ],
    queryFn: ({ signal }) =>
      merged.rows(
        {
          params,
          signal,
          api: {
            fetchTableRowEntities: subgraph.fetchTableRowEntities,
          },
        },
        dedupedColumns,
        type?.entityId
      ),
  });

  const setPage = React.useCallback(
    (page: number | 'next' | 'previous') => {
      switch (page) {
        case 'next':
          setPageNumber(pageNumber + 1);
          break;
        case 'previous': {
          const previousPageNumber = pageNumber - 1;
          if (previousPageNumber < 0) return;
          setPageNumber(previousPageNumber);
          break;
        }
        default:
          setPageNumber(page);
      }
    },
    [pageNumber]
  );

  const setFilterState = React.useCallback(
    (filters: TableBlockFilter[]) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString =
        newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, type?.entityId ?? null);

      const entityName = Entity.name(nameTriple ? [nameTriple] : []) ?? '';

      if (!filterTriple) {
        return store.create(
          Triple.withId({
            attributeId: SYSTEM_IDS.FILTER,
            attributeName: 'Filter',
            entityId: entityId,
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

      return store.update(
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
    [entityId, spaceId, nameTriple, filterTriple, store, type?.entityId]
  );

  // 1. Fetch all attributes that are entity values
  // 2. Filter attributes that have the relation type attribute
  // 3. Return the type id and name of the relation type

  // Make sure we merge any unpublished entities
  const { data: maybeRelationAttributeTypes, isLoading: isLoadingAttributRelationTypes } = useQuery({
    queryKey: ['relation attribute types in table block', entityId, columns],
    queryFn: () => {
      if (!columns) return [];

      return Promise.all(
        columns.map(t => t.id).map(attributeId => merged.fetchEntity({ id: attributeId, endpoint: config.subgraph }))
      );
    },
  });

  const relationTypeEntities = maybeRelationAttributeTypes?.flatMap(a => (a ? a.triples : []));

  // Merge all local and server triples
  const mergedTriples = A.uniqBy(Triple.fromActions(store.allActions$.get(), relationTypeEntities ?? []), t => t.id);

  const relationTypes = mergedTriples.filter(
    t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'entity'
  );

  const columnRelationTypes = relationTypes.reduce<
    Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>
  >((acc, relationType) => {
    if (!acc[relationType.entityId]) acc[relationType.entityId] = [];

    acc[relationType.entityId].push({
      typeId: relationType.value.id,

      // We can safely cast here because we filter for entity type values above.
      typeName: (relationType.value as EntityValue).name,
      spaceId: relationType.space,
    });

    return acc;
  }, {});

  const hasNextPage = rows?.rows?.length && rows.rows.length > PAGE_SIZE;
  const hasPreviousPage = pageNumber > 0;

  return {
    nameTriple,
    spaceId,
    entityId,
    type,
    rows: rows?.rows.slice(0, PAGE_SIZE) ?? [],
    columns: dedupedColumns,
    unpublishedColumns: [],
    pageNumber,
    hasNextPage,
    hasPreviousPage,
    setPage,
    blockEntity,
    filterState: filterState ?? [],
    setFilterState,
    isLoading:
      isLoadingBlockEntity ||
      isLoadingColumns ||
      isLoadingRows ||
      isLoadingFilterState ||
      isLoadingAttributRelationTypes,
    columnRelationTypes,
  };
}
