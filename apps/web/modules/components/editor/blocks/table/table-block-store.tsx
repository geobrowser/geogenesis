import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { ActionsStore, useActionsStoreContext } from '~/modules/action';
import { Entity, EntityTable } from '~/modules/entity';
import { Services } from '~/modules/services';
import { Column, Entity as IEntity, Triple as ITriple, Row, TripleValueType } from '~/modules/types';
import { useSelector } from '@legendapp/state/react';
import { MergedData, NetworkData } from '~/modules/io';
import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { makeOptionalComputed } from '~/modules/utils';
import { Triple } from '~/modules/triple';
import { A, pipe } from '@mobily/ts-belt';
import { FetchRowsOptions } from '~/modules/io/data-source/network';
import { TableBlockSdk } from '../sdk';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { ID } from '~/modules/id';

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
  selectedType: ITriple;

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
  type$: Observable<ITriple>;
  blockEntity$: ObservableComputed<IEntity | null>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  filterState$: ObservableComputed<TableBlockFilter[]>;
  isLoading$: Observable<boolean>;
  abortController: AbortController;

  constructor({ api, spaceId, ActionsStore, entityId, selectedType }: ITableBlockStoreConfig) {
    this.api = api;
    this.entityId = entityId;
    this.ActionsStore = ActionsStore;
    this.type$ = observable(selectedType);
    this.pageNumber$ = observable(0);
    this.MergedData = new MergedData({ api, store: ActionsStore });
    this.isLoading$ = observable(true);
    this.abortController = new AbortController();

    this.blockEntity$ = makeOptionalComputed(
      null,
      computed(() => this.MergedData.fetchEntity(entityId))
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
        const filterValue = filter?.value.type === 'string' ? filter?.value.value : '';

        return await TableBlockSdk.createFiltersFromGraphQLString(filterValue, this.MergedData.fetchEntity);
      })
    );

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], hasNextPage: false },
      computed(async () => {
        try {
          this.abortController.abort();
          this.abortController = new AbortController();

          const pageNumber = this.pageNumber$.get();

          const filterString = TableBlockSdk.createGraphQLStringFromFilters(
            this.filterState$.get(),
            this.type$.get().entityId
          );

          const params: FetchRowsOptions['params'] = {
            query: '',
            filter: filterString,
            typeIds: [selectedType.entityId],
            first: PAGE_SIZE + 1,
            skip: pageNumber * PAGE_SIZE,
          };

          this.isLoading$.set(true);

          const { columns: serverColumns } = await this.api.columns({
            params,
            abortController: this.abortController,
          });

          const { rows: serverRows } = await this.api.rows({
            params,
            abortController: this.abortController,
          });

          return {
            columns: serverColumns,
            rows: serverRows.slice(0, PAGE_SIZE),
            hasNextPage: serverRows.length > PAGE_SIZE,
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

    this.columns$ = computed(() => {
      const { columns } = networkData$.get();
      return EntityTable.columnsFromActions(this.ActionsStore.actions$.get()[spaceId], columns, selectedType.entityId);
    });

    // @TODO: Use fetchEntity in the fetches here. Could also probably use MergedData
    this.rows$ = makeOptionalComputed(
      [],
      computed(async () => {
        const columns = this.columns$.get();
        const { rows: serverRows } = networkData$.get();

        /**
         * There are several edge-cases we need to handle in order to correctly merge local changes
         * with server data in the entity table:
         * 1. An entity is created locally and is given the selected type
         * 2. An entity is edited locally and is given the selected type
         * 3. A type is created locally and an entity is given the new type
         *
         * Since the table aggregation code expects triples, we may end up in a situation where
         * the type for an entity has changed, but the name hasn't. In this case there is no local
         * version of the name triple, so we need to fetch it along with any other triples the table
         * needs to render the columnSchema.
         */
        const changedEntitiesIdsFromAnotherType = pipe(
          this.ActionsStore.actions$.get()[spaceId],
          actions => Triple.fromActions(actions, []),
          triples => Entity.entitiesFromTriples(triples),
          A.filter(e => e.types.some(t => t.id === selectedType.entityId)),
          A.map(t => t.id)
        );

        // Fetch any entities that exist already remotely that have been changed locally
        // and have the selected type to make sure we have all of the triples necessary
        // to represent the entity in the table.
        //
        // e.g., We add Type A to Entity A. When we render the Type A table, we need
        // _all_ of the triples for Entity A, not just the ones that have changed locally.
        //
        // This will return null if the entity we're fetching does not exist remotely.
        // i.e., the entity was created locally and has not been published to the server.
        const maybeServerEntitiesChangedLocally = await Promise.all(
          changedEntitiesIdsFromAnotherType.map(id => this.api.fetchEntity(id))
        );

        const serverEntitiesChangedLocally = maybeServerEntitiesChangedLocally.flatMap(e => (e ? [e] : []));

        const serverEntityTriples = serverRows.flatMap(t => t.triples);

        const entitiesCreatedOrChangedLocally = pipe(
          this.ActionsStore.actions$.get(),
          actions => Entity.mergeActionsWithEntities(actions, Entity.entitiesFromTriples(serverEntityTriples)),
          A.filter(e => e.types.some(t => t.id === selectedType.entityId))
        );

        const localEntitiesIds = new Set(entitiesCreatedOrChangedLocally.map(e => e.id));
        const serverEntitiesChangedLocallyIds = new Set(serverEntitiesChangedLocally.map(e => e.id));

        // Filter out any server rows that have been changed locally
        const filteredServerRows = serverEntityTriples.filter(
          sr => !localEntitiesIds.has(sr.entityId) && !serverEntitiesChangedLocallyIds.has(sr.entityId)
        );

        const entities = Entity.entitiesFromTriples([
          // These are entities that were created locally and have the selected type
          ...entitiesCreatedOrChangedLocally.flatMap(e => e.triples),

          // These are entities that have a new type locally and may exist on the server.
          // We need to fetch all triples associated with this entity in order to correctly
          // populate the table.
          ...serverEntitiesChangedLocally.flatMap(e => e.triples),

          // These are entities that have been fetched from the server and have the selected type.
          // They are deduped from the local changes above.
          ...filteredServerRows,
        ]);

        // Make sure we only generate rows for entities that have the selected type
        const entitiesWithSelectedType = entities.filter(e => e.types.some(t => t.id === selectedType.entityId));

        // const filterState = this.filterState$.get();

        // // @TODO: Going to remove this eventually for server side + client side filtering
        // if (filterState.length > 0) {
        //   const filteredEntities = entitiesWithSelectedType.filter(entity => {
        //     return entity.triples.find(triple => {
        //       return filterState.every(filter => {
        //         if (triple.attributeId === filter.columnId) {
        //           if (filter.type === 'string' && triple.value.type === 'string') {
        //             return triple.value.value.toLowerCase().startsWith(filter.value.toLowerCase());
        //           }

        //           if (filter.type === 'entity' && triple.value.type === 'entity') {
        //             return triple.value.name?.toLowerCase().startsWith(filter.value.toLowerCase());
        //           }
        //         }

        //         return false;
        //       });
        //     });
        //   });

        //   const { rows } = EntityTable.fromColumnsAndRows(spaceId, filteredEntities, columns);
        //   return rows;
        // }

        const { rows } = EntityTable.fromColumnsAndRows(spaceId, entitiesWithSelectedType, columns);

        this.isLoading$.set(false);

        return rows;
      })
    );

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromActions(this.ActionsStore.actions$.get()[spaceId], [], selectedType.entityId);
    });

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
      newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, this.type$.get().entityId);

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

    // If the triple exists and we remove the last filter, we can just delete the triple.
    if (newState.length === 0) {
      return this.ActionsStore.remove(filterTriple);
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
  selectedType: ITriple;
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
    type$,
    unpublishedColumns$,
    blockEntity$,
    hasNextPage$,
    hasPreviousPage$,
    setPage,
    filterState$,
    setFilterState,
    isLoading$,
  } = useTableBlockStore();
  const type = useSelector(type$);
  const rows = useSelector(rows$);
  const columns = useSelector(columns$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const pageNumber = useSelector(pageNumber$);
  const hasNextPage = useSelector(hasNextPage$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const blockEntity = useSelector(blockEntity$);
  const filterState = useSelector<TableBlockFilter[]>(filterState$);
  const isLoading = useSelector(isLoading$);

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
  };
}
