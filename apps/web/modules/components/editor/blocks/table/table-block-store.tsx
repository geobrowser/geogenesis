import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { ActionsStore, useActionsStoreContext } from '~/modules/action';
import { Entity, EntityTable } from '~/modules/entity';
import { Services } from '~/modules/services';
import { Column, Entity as IEntity, Triple as ITriple, Row } from '~/modules/types';
import { useSelector } from '@legendapp/state/react';
import { MergedData, NetworkData } from '~/modules/io';
import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { makeOptionalComputed } from '~/modules/utils';
import { Triple } from '~/modules/triple';
import { A, pipe } from '@mobily/ts-belt';

export const PAGE_SIZE = 10;

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
  pageNumber$: Observable<number> = observable(0);
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  columns$: ObservableComputed<Column[]>;
  rows$: ObservableComputed<Row[]>;
  type$: Observable<ITriple>;
  blockEntity$: ObservableComputed<IEntity | null>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  abortController: AbortController = new AbortController();

  constructor({ api, spaceId, ActionsStore, entityId, selectedType }: ITableBlockStoreConfig) {
    this.api = api;
    this.ActionsStore = ActionsStore;
    this.type$ = observable(selectedType);
    this.MergedData = new MergedData({ api, store: ActionsStore });

    this.blockEntity$ = makeOptionalComputed(
      null,
      computed(() => this.MergedData.fetchEntity(entityId))
    );

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], hasNextPage: false },
      computed(async () => {
        try {
          this.abortController.abort();
          this.abortController = new AbortController();

          const pageNumber = this.pageNumber$.get();

          const params = {
            query: '',
            pageNumber: pageNumber,
            filterState: [],
            typeId: selectedType.entityId,
            first: PAGE_SIZE + 1,
            skip: pageNumber * PAGE_SIZE,
          };

          const { columns: serverColumns } = await this.api.columns({
            spaceId: spaceId,
            params,
            abortController: this.abortController,
          });

          const { rows: serverRows } = await this.api.rows({
            spaceId: spaceId,
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

        const { rows } = EntityTable.fromColumnsAndRows(spaceId, entitiesWithSelectedType, columns);

        return rows;
      })
    );

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromActions(this.ActionsStore.actions$.get()[spaceId], [], selectedType.entityId);
    });

    this.hasNextPage$ = computed(() => {
      return networkData$.get().hasNextPage;
    });

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
// scoped specifically for table blocks and will have unique behavior
// in the future.
//
// @TODO
// 1. Reference to the configuration entity for the table block
// 2. New store implementation (instead of EntityTableStore). This is
//    so we explore new implementation for the table block that differs
//    from the entity page table.
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
  } = useTableBlockStore();
  const type = useSelector(type$);
  const rows = useSelector(rows$);
  const columns = useSelector(columns$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const pageNumber = useSelector(pageNumber$);
  const hasNextPage = useSelector(hasNextPage$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const blockEntity = useSelector(blockEntity$);

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
  };
}
