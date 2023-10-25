'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { Observable, ObservableComputed, batch, computed, observable } from '@legendapp/state';
import { observe } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A } from '@mobily/ts-belt';
import { QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { FetchRowsOptions } from '~/core/io/fetch-rows';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { Column, EntityValue, GeoType, Entity as IEntity, Triple as ITriple, Row, TripleValueType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { EntityTable } from '~/core/utils/entity-table';
import { Triple } from '~/core/utils/triple';
import { makeOptionalComputed } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { ActionsStore } from './actions-store/actions-store';
import { useActionsStoreInstance } from './actions-store/actions-store-provider';
import { LocalStore, useLocalStoreInstance } from './local-store';

export const PAGE_SIZE = 10;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

interface ITableBlockStoreConfig {
  subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;

  // We pass through React Query's QueryClient so we can cache data fetches in the store.
  queryClient: QueryClient;

  // We use the ActionsStore to derive any new columns or rows that might exist
  // locally but not remotely.
  ActionsStore: ActionsStore;

  // We use the LocalStore to read any data that might exist locally but not remotely.
  LocalStore: LocalStore;

  // Entity ID of the TableBlock entity. We use this to manipulate Table properties
  // such as name, the Table image, sorting, filtering, etc. since these properties
  // are defined on the TableBlock entity itself.
  entityId: string;

  // This is the type of Entity we are rendering in the rows in the TableBlock
  // e.g., a Person or a Project
  selectedType: GeoType;

  spaceId: string;
}

/**
 * The TableBlockStore handles state and logic for the TableBlock component that
 * gets rendered on entity pages as TableBlocks. For now it duplicated a lot of functionality
 * that we have in the EntityTableStore as well. Eventually the EntityTable will be
 * de-emphasized in the product and we will be able to migrate a lot of the implementation
 * from here to the EntityTableStore
 *
 * For now we are fine with the duplication.
 */
export class TableBlockStore {
  ActionsStore: ActionsStore;
  Merged: Merged;
  LocalStore: LocalStore;
  entityId: string;
  spaceId: string;
  nameTriple$: ObservableComputed<ITriple | null>;
  pageNumber$: Observable<number>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: Observable<boolean>;
  columns$: Observable<Column[]>;
  rows$: Observable<Row[]>;
  type: GeoType;
  blockEntity$: ObservableComputed<IEntity | null>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  filterTriple$: ObservableComputed<ITriple | null>;
  filterState$: ObservableComputed<TableBlockFilter[]>;
  isLoading$: Observable<boolean>;
  columnRelationTypes$: ObservableComputed<
    Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>
  >;
  abortController: AbortController;

  constructor({
    ActionsStore,
    entityId,
    spaceId,
    selectedType,
    LocalStore,
    queryClient,
    subgraph,
    config,
  }: ITableBlockStoreConfig) {
    this.entityId = entityId;
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;
    this.LocalStore = LocalStore;
    this.rows$ = observable<Row[]>([]);
    this.columns$ = observable<Column[]>([]);
    this.hasNextPage$ = observable(false);
    this.type = selectedType;
    this.pageNumber$ = observable(0);
    this.Merged = new Merged({ store: ActionsStore, localStore: LocalStore, subgraph });
    this.isLoading$ = observable(true);
    this.abortController = new AbortController();

    this.blockEntity$ = computed(async () => {
      return await queryClient.fetchQuery({
        queryKey: ['blockEntity in table block', entityId],
        queryFn: () => this.Merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
      });
    });

    this.nameTriple$ = computed(() => {
      const blockEntity = this.blockEntity$.get();
      const localTriplesForEntityId = this.LocalStore.triplesByEntityId$[this.entityId].get();
      const localNameTriple = localTriplesForEntityId?.find(t => t.attributeId === SYSTEM_IDS.NAME);
      const serverNameTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);

      return localNameTriple ?? serverNameTriple ?? null;
    });

    this.filterTriple$ = computed(() => {
      const blockEntity = this.blockEntity$.get();
      const localTriplesForEntityId = this.LocalStore.triplesByEntityId$[this.entityId].get();
      const localFilterTriple = localTriplesForEntityId?.find(t => t.attributeId === SYSTEM_IDS.FILTER);
      const serverTripleFilter = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER);

      return localFilterTriple ?? serverTripleFilter ?? null;
    });

    this.filterState$ = makeOptionalComputed(
      [],
      computed(async () => {
        const filter = this.filterTriple$.get();
        const filterValue = Value.stringValue(filter ?? undefined) ?? '';

        const filterState = await queryClient.fetchQuery({
          queryKey: ['filterState in table block', entityId, filterValue],
          queryFn: () =>
            TableBlockSdk.createFiltersFromGraphQLString(
              filterValue,
              async id => await this.Merged.fetchEntity({ id, endpoint: config.subgraph })
            ),
        });

        return filterState;
      })
    );

    observe(async () => {
      try {
        // @NOTE: For some reason this.LocalStore.triplesByEntityId$[this.entityId].get() doesn't
        // cause the `observe` to re-run when the triples for this block change. For now we manually
        // re-run all the previous computations to ensure that we have the latest data at this point.
        //
        // This is so first render of the table has all of the table filter information ahead of time.
        // By caching all the async calls we should be avoiding any unnecessary network requests in
        // the places we are duplicating requests.
        //
        // @HACK: We manually trigger a re-run when this.filterState$.get() changes. This works even though
        // this.filterState$ itself re-runs when this.LocalStore.triplesByEntityId$[this.entityId].get()
        // changes. :shrug:
        this.filterState$.get();

        this.abortController.abort();
        this.abortController = new AbortController();

        const pageNumber = this.pageNumber$.get();
        this.isLoading$.set(true);

        const blockEntity = await queryClient.fetchQuery({
          queryKey: ['blockEntity in table block', entityId],
          queryFn: () => this.Merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
        });

        // @NOTE: See @NOTE at top of this observe block
        const localTriplesForEntityId = this.LocalStore.triplesByEntityId$[this.entityId].get();
        const localFilterTriple = localTriplesForEntityId?.find(t => t.attributeId === SYSTEM_IDS.FILTER);
        const serverTripleFilter = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER);

        const filterTriple = localFilterTriple ?? serverTripleFilter ?? null;

        const filter = filterTriple;
        const filterValue = Value.stringValue(filter ?? undefined) ?? '';

        const filterState = await queryClient.fetchQuery({
          queryKey: ['filterState in table block', entityId, filterValue],
          queryFn: () =>
            TableBlockSdk.createFiltersFromGraphQLString(
              filterValue,
              async id => await this.Merged.fetchEntity({ id, endpoint: config.subgraph })
            ),
        });

        const filterString = TableBlockSdk.createGraphQLStringFromFilters(filterState, this.type.entityId);

        const params: FetchRowsOptions['params'] = {
          endpoint: config.subgraph,
          query: '',
          filter: filterString,
          typeIds: selectedType?.entityId ? [selectedType.entityId] : [],
          first: PAGE_SIZE + 1,
          skip: pageNumber * PAGE_SIZE,
        };

        /**
         * Aggregate columns from local and server columns.
         */
        const columns = await queryClient.fetchQuery({
          queryKey: [
            'columns in table block',
            entityId,
            params.filter,
            params.first,
            params.query,
            params.skip,
            params.typeIds,
          ],
          queryFn: () =>
            this.Merged.columns({
              api: {
                fetchEntity: subgraph.fetchEntity,
                fetchTriples: subgraph.fetchTriples,
              },
              params,
              signal: this.abortController.signal,
            }),
        });

        const dedupedColumns = columns.reduce((acc, column) => {
          if (acc.find(c => c.id === column.id)) return acc;
          return [...acc, column];
        }, [] as Column[]);

        /**
         * Aggregate data for the rows from local and server entities.
         */
        const { rows } = await queryClient.fetchQuery({
          queryKey: [
            'rows in table block',
            entityId,
            params.filter,
            params.first,
            params.query,
            params.skip,
            params.typeIds,
            selectedType?.entityId,
            dedupedColumns,
          ],
          queryFn: () =>
            this.Merged.rows(
              {
                params,
                signal: this.abortController.signal,
                api: {
                  fetchTableRowEntities: subgraph.fetchTableRowEntities,
                },
              },
              dedupedColumns,
              selectedType?.entityId
            ),
        });

        batch(() => {
          this.isLoading$.set(false);
          this.rows$.set(rows);
          this.columns$.set(dedupedColumns);
          this.hasNextPage$.set(rows.length > PAGE_SIZE);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          return new Promise(() => {});
        }
      }
    });

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromLocalChanges(this.LocalStore.triples$.get(), [], selectedType?.entityId);
    });

    this.columnRelationTypes$ = makeOptionalComputed(
      {},
      computed(async () => {
        const columns = this.columns$.get();

        // 1. Fetch all attributes that are entity values
        // 2. Filter attributes that have the relation type attribute
        // 3. Return the type id and name of the relation type

        // Make sure we merge any unpublished entities
        const maybeRelationAttributeTypes = await queryClient.fetchQuery({
          queryKey: ['relation attribute types in table block', entityId, columns],
          queryFn: () =>
            Promise.all(
              columns
                .map(t => t.id)
                .map(attributeId => this.Merged.fetchEntity({ id: attributeId, endpoint: config.subgraph }))
            ),
        });

        const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

        // Merge all local and server triples
        const mergedTriples = A.uniqBy(
          Triple.fromActions(this.ActionsStore.allActions$.get(), relationTypeEntities),
          t => t.id
        );

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
      })
    );

    this.hasPreviousPage$ = computed(() => {
      return this.pageNumber$.get() > 0;
    });
  }

  setPage = (page: number | 'next' | 'previous') => {
    switch (page) {
      case 'next':
        this.pageNumber$.set(this.pageNumber$.get() + 1);
        break;
      case 'previous': {
        const previousPageNumber = this.pageNumber$.get() - 1;
        if (previousPageNumber < 0) return;
        this.pageNumber$.set(previousPageNumber);
        break;
      }
      default:
        this.pageNumber$.set(page);
    }
  };

  setFilterState = (filters: TableBlockFilter[]) => {
    const newState = filters.length === 0 ? [] : filters;
    const filterTriple = this.filterTriple$.get();

    // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
    const newFiltersString =
      newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, this.type.entityId);

    const nameTriple = this.nameTriple$.get();
    const entityName = Entity.name(nameTriple ? [nameTriple] : []) ?? '';

    if (!filterTriple) {
      return this.ActionsStore.create(
        Triple.withId({
          attributeId: SYSTEM_IDS.FILTER,
          attributeName: 'Filter',
          entityId: this.entityId,
          space: this.spaceId,
          entityName,
          value: {
            type: 'string',
            value: newFiltersString,
            id: ID.createValueId(),
          },
        })
      );
    }

    return this.ActionsStore.update(
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
  };
}

const TableBlockStoreContext = createContext<TableBlockStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;

  // @TODO: This should be type Entity
  selectedType?: GeoType;
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
  const { subgraph, config } = Services.useServices();
  const LocalStore = useLocalStoreInstance();
  const ActionsStore = useActionsStoreInstance();
  const queryClient = useQueryClient();

  if (!selectedType) {
    // A table block might reference a type that has been deleted which will not be found
    // in the types store.
    console.error(`Undefined type in blockId: ${entityId}`);
    throw new Error('Missing selectedType in TableBlockStoreProvider');
  }

  const store = useMemo(() => {
    return new TableBlockStore({
      spaceId,
      ActionsStore,
      LocalStore,
      selectedType,
      entityId,
      queryClient,
      subgraph,
      config,
    });
  }, [spaceId, selectedType, ActionsStore, entityId, LocalStore, queryClient, subgraph, config]);

  return <TableBlockStoreContext.Provider value={store}>{children}</TableBlockStoreContext.Provider>;
}

export function useTableBlockStoreInstance() {
  const value = useContext(TableBlockStoreContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}

export function useTableBlock() {
  const {
    spaceId,
    entityId,
    nameTriple$,
    rows$,
    pageNumber$,
    columns$,
    type,
    unpublishedColumns$,
    blockEntity$,
    hasNextPage$,
    hasPreviousPage$,
    setPage,
    filterState$,
    setFilterState,
    isLoading$,
    columnRelationTypes$,
  } = useTableBlockStoreInstance();
  const nameTriple = useSelector(nameTriple$);
  const rows = useSelector<Row[]>(rows$);
  const columns = useSelector<Column[]>(columns$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const pageNumber = useSelector(pageNumber$);
  const hasNextPage = useSelector(hasNextPage$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const blockEntity = useSelector(blockEntity$);
  const filterState = useSelector<TableBlockFilter[]>(filterState$);
  const isLoading = useSelector(isLoading$);
  const columnRelationTypes = useSelector(columnRelationTypes$);

  return {
    nameTriple,
    spaceId,
    entityId,
    type,
    rows,
    columns,
    unpublishedColumns,
    pageNumber,
    hasNextPage,
    hasPreviousPage,
    setPage,
    blockEntity,
    filterState,
    setFilterState,
    isLoading,
    columnRelationTypes,
  };
}
