import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';
import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

import { ActionsStore, useActionsStoreContext } from '~/modules/action';
import { Entity, EntityTable, SelectedEntityType } from '~/modules/entity';
import { Services } from '~/modules/services';
import { Column, Entity as IEntity, Row, TripleValueType } from '~/modules/types';
import { MergedData, NetworkData } from '~/modules/io';
import { makeOptionalComputed } from '~/modules/utils';
import { Triple } from '~/modules/triple';
import { FetchRowsOptions } from '~/modules/io/data-source/network';
import { TableBlockSdk } from '../sdk';
import { ID } from '~/modules/id';
import { Value } from '~/modules/value';

export const PAGE_SIZE = 10;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

interface ITableBlockStoreConfig {
  api: NetworkData.INetwork;

  // We use the ActionsStore to derive any new columns or rows that might exist
  // locally but not remotely.
  ActionsStore: ActionsStore;

  // Entity ID of the TableBlock entity. We use this to manipulate Table properties
  // such as name, the Table image, sorting, filtering, etc. since these properties
  // are defined on the TableBlock entity itself.
  entityId: string;

  // This is the type of Entity we are rendering in the rows in the TableBlock
  // e.g., a Person or a Project
  selectedType: SelectedEntityType;

  // @TODO: Columns and rows shouldn't be dependent on Space?
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
  api: NetworkData.INetwork;
  ActionsStore: ActionsStore;
  MergedData: MergedData;
  entityId: string;
  pageNumber$: Observable<number>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  columns$: ObservableComputed<Column[]>;
  rows$: ObservableComputed<Row[]>;
  type: SelectedEntityType;
  blockEntity$: ObservableComputed<IEntity | null>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  filterState$: ObservableComputed<TableBlockFilter[]>;
  isLoading$: Observable<boolean>;
  columnRelationTypes$: ObservableComputed<Record<string, { typeId: string }>>;
  abortController: AbortController;

  constructor({ api, spaceId, ActionsStore, entityId, selectedType }: ITableBlockStoreConfig) {
    this.api = api;
    this.entityId = entityId;
    this.ActionsStore = ActionsStore;
    this.type = selectedType;
    this.pageNumber$ = observable(0);
    this.MergedData = new MergedData({ api, store: ActionsStore });
    this.isLoading$ = observable(true);
    this.abortController = new AbortController();

    this.blockEntity$ = makeOptionalComputed(
      null,
      computed(() => {
        // HACK: This is a hack to rerun this computed when actions change.
        // In the future we should pass in the actions as a dependency to
        // the MergedData method calls to trigger any re-runs of computeds.
        this.ActionsStore.allActions$.get();
        return this.MergedData.fetchEntity(entityId);
      })
    );

    this.filterState$ = makeOptionalComputed(
      [],
      computed(async () => {
        // 1. Get either the server Filter triple or the local Filter triple
        // 2. Map the value of the Filter triple to TableBlockFilter[]
        const serverFilterTriple = this.blockEntity$.get()?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER);
        const localFilterTriple = pipe(
          this.ActionsStore.allActions$.get(),
          actions => Triple.fromActions(actions, []),
          A.find(t => t.entityId === entityId && t.attributeId === SYSTEM_IDS.FILTER)
        );

        // Default to the locally changed version of a filter if it exists
        const filter = localFilterTriple ?? serverFilterTriple;
        const filterValue = Value.stringValue(filter) ?? '';

        return TableBlockSdk.createFiltersFromGraphQLString(filterValue, this.MergedData.fetchEntity);
      })
    );

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], hasNextPage: false },
      computed(async () => {
        try {
          this.abortController.abort();
          this.abortController = new AbortController();

          const pageNumber = this.pageNumber$.get();

          this.isLoading$.set(true);

          const filterString = TableBlockSdk.createGraphQLStringFromFilters(
            this.filterState$.get(),
            this.type.entityId
          );

          const params: FetchRowsOptions['params'] = {
            query: '',
            filter: filterString,
            typeIds: selectedType?.entityId ? [selectedType.entityId] : [],
            first: PAGE_SIZE + 1,
            skip: pageNumber * PAGE_SIZE,
          };

          /**
           * Aggregate columns from local and server columns.
           */
          const { columns } = await this.MergedData.columns({
            params,
            abortController: this.abortController,
          });

          /**
           * Aggregate data for the rows from local and server entities.
           */
          const { rows } = await this.MergedData.rows(
            {
              params,
              abortController: this.abortController,
            },
            columns,
            selectedType?.entityId
          );

          this.isLoading$.set(false);

          return {
            columns,
            rows: rows.slice(0, PAGE_SIZE),
            hasNextPage: rows.length > PAGE_SIZE,
          };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return new Promise(() => {});
          }

          // TODO: Real error handling
          return { columns: [], rows: [], hasNextPage: false };
        }
      })
    );

    this.rows$ = computed(() => {
      const { rows } = networkData$.get();
      return rows;
    });

    this.columns$ = computed(() => {
      const { columns } = networkData$.get();
      return columns;
    });

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromActions(this.ActionsStore.actions$.get()[spaceId], [], selectedType?.entityId);
    });

    this.columnRelationTypes$ = makeOptionalComputed(
      {},
      computed(async () => {
        const columns = this.columns$.get();

        // 1. Fetch all attributes that are entity values
        // 2. Filter attributes that have the relation type attribute
        // 3. Return the type id and name of the relation type

        // Make sure we merge any unpublished entities
        const mergedStore = new MergedData({ api: this.api, store: this.ActionsStore });
        const maybeRelationAttributeTypes = await Promise.all(
          columns.map(t => t.id).map(attributeId => mergedStore.fetchEntity(attributeId))
        );

        const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

        const relationTypes = relationTypeEntities.filter(
          t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'entity'
        );

        return relationTypes.reduce<Record<string, { typeId: string }>>((acc, relationType) => {
          acc[relationType.entityId] = {
            typeId: relationType.value.id,
          };

          return acc;
        }, {});
      })
    );

    this.hasNextPage$ = computed(() => networkData$.get().hasNextPage);
    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);
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
    const filterTriple = this.blockEntity$.get()?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER);

    // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
    const newFiltersString =
      newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, this.type.entityId);

    if (!filterTriple) {
      return this.ActionsStore.create(
        Triple.withId({
          attributeId: SYSTEM_IDS.FILTER,
          attributeName: 'Filter',
          entityId: this.entityId,
          space: this.blockEntity$.get()?.nameTripleSpace ?? '',
          entityName: Entity.name(this.blockEntity$.get()?.triples ?? []) ?? '',
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
        entityName: Entity.name(this.blockEntity$.get()?.triples ?? []) ?? '',
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
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  if (!selectedType) {
    // A table block might reference a type that has been deleted which will not be found
    // in the types store.
    console.error(`Undefined type in blockId: ${entityId}`);
    throw new Error('Missing selectedType in TableBlockStoreProvider');
  }

  const store = useMemo(() => {
    return new TableBlockStore({
      api: network,
      spaceId,
      ActionsStore,
      selectedType,
      entityId,
    });
  }, [network, spaceId, selectedType, ActionsStore, entityId]);

  return <TableBlockStoreContext.Provider value={store}>{children}</TableBlockStoreContext.Provider>;
}

export function useTableBlockStore() {
  const value = useContext(TableBlockStoreContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}

export function useTableBlock() {
  const {
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
  } = useTableBlockStore();
  const rows = useSelector(rows$);
  const columns = useSelector(columns$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const pageNumber = useSelector(pageNumber$);
  const hasNextPage = useSelector(hasNextPage$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const blockEntity = useSelector(blockEntity$);
  const filterState = useSelector<TableBlockFilter[]>(filterState$);
  const isLoading = useSelector(isLoading$);
  const columnRelationTypes = useSelector(columnRelationTypes$);

  return {
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
