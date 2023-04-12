import { SYSTEM_IDS } from '@geogenesis/ids';
import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import produce from 'immer';

import { ActionsStore } from '~/modules/action';
import { SpaceStore } from '~/modules/spaces/space-store';
import { Triple } from '~/modules/triple';
import { Entity, EntityTable } from '..';
import { NetworkData } from '~/modules/io';
import { Column, FilterState, Row, Space, Triple as TripleType } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { InitialEntityTableStoreParams } from './entity-table-store-params';
import { CreateType } from '~/modules/type';

export type SelectedType = { id: string; entityId: string; entityName: string | null };

interface IEntityTableStore {
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  selectedType$: Observable<SelectedType | null>;
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hydrated$: Observable<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
  columnValueType: (columnId: string) => string;
}

interface IEntityTableStoreConfig {
  api: NetworkData.INetwork;
  spaceId: string;
  initialParams?: InitialEntityTableStoreParams;
  pageSize?: number;
  initialRows: Row[];
  initialSelectedType: TripleType | null;
  initialColumns: Column[];
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
}

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_INITIAL_PARAMS = {
  query: '',
  pageNumber: 0,
  filterState: [],
  typeId: '',
};

export function initialFilterState(): FilterState {
  return [
    {
      field: 'entity-name',
      value: '',
    },
  ];
}

/**
 * The EntityTableStore handles state and logic for the EntityTable component that
 * gets rendered on the /spaces/[id] route. For now it duplicated a lot of functionality
 * that we have in the TableBlockStore as well. Eventually the EntityTable will be
 * de-emphasized in the product and we will be able to migrate a lot of the implementation
 * from the TableBlockStore to here.
 *
 * For now we are fine with the duplication.
 */
export class EntityTableStore implements IEntityTableStore {
  private api: NetworkData.INetwork;
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  hydrated$: Observable<boolean> = observable(false);
  pageNumber$: Observable<number>;
  selectedType$: Observable<SelectedType | null>;

  query$: ObservableComputed<string>;
  space$: ObservableComputed<Space | undefined>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  spaceId: string;
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
  abortController: AbortController = new AbortController();

  constructor({
    api,
    spaceId,
    initialRows,
    initialSelectedType,
    initialColumns,
    ActionsStore,
    SpaceStore,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: IEntityTableStoreConfig) {
    this.api = api;
    this.ActionsStore = ActionsStore;
    this.SpaceStore = SpaceStore;
    this.hydrated$ = observable(false);
    this.rows$ = observable(initialRows);
    this.selectedType$ = observable<SelectedType | null>(initialSelectedType);
    this.pageNumber$ = observable(initialParams.pageNumber);
    this.columns$ = observable(initialColumns);

    this.filterState$ = observable<FilterState>(
      initialParams.filterState.length === 0 ? initialFilterState() : initialParams.filterState
    );

    this.spaceId = spaceId;
    this.query$ = computed(() => {
      const filterState = this.filterState$.get();
      return filterState.find(f => f.field === 'entity-name')?.value || '';
    });

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], triples: [] },
      computed(async () => {
        try {
          this.abortController.abort();
          this.abortController = new AbortController();

          const selectedType = this.selectedType$.get();
          const pageNumber = this.pageNumber$.get();

          const params = {
            query: this.query$.get(),
            pageNumber: pageNumber,
            filterState: this.filterState$.get(),
            typeId: selectedType?.entityId || null,
            first: pageSize + 1,
            skip: pageNumber * pageSize,
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

          this.hydrated$.set(true);

          return {
            columns: serverColumns,
            rows: serverRows.slice(0, pageSize),
          };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return new Promise(() => {});
          }

          // TODO: Real error handling
          return { columns: [], rows: [], triples: [], hasNextPage: false };
        }
      })
    );

    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromActions(
        this.ActionsStore.actions$.get()[spaceId],
        [],
        this.selectedType$.get()?.entityId
      );
    });

    this.columns$ = computed(() => {
      const { columns } = networkData$.get();
      return EntityTable.columnsFromActions(
        this.ActionsStore.actions$.get()[spaceId],
        columns,
        this.selectedType$.get()?.entityId
      );
    });

    this.space$ = computed(() => {
      const spaces = this.SpaceStore.spaces$.get();
      return spaces.find(s => s.id === spaceId);
    });

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
          A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId)),
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
          A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId))
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
        const entitiesWithSelectedType = entities.filter(e =>
          e.types.some(t => t.id === this.selectedType$.get()?.entityId)
        );

        const { rows } = EntityTable.fromColumnsAndRows(spaceId, entitiesWithSelectedType, columns);

        return rows;
      })
    );

    this.hasNextPage$ = computed(() => (this.rows$.get()?.length ?? 0) > pageSize);
  }

  columnValueType = (columnId: string): string => {
    const column = this.columns$.get().find(c => c.id === columnId);

    if (!column) {
      // Typescript defensive programming
      return SYSTEM_IDS.TEXT;
    }

    return Entity.valueTypeId(column.triples) ?? SYSTEM_IDS.TEXT;
  };

  columnName = (columnId: string): string => {
    const column = this.columns$.get().find(c => c.id === columnId);

    if (!column) {
      // Typescript defensive programming
      return '';
    }

    return Entity.name(column.triples) || '';
  };

  setQuery = (query: string) => {
    this.setFilterState(
      produce(this.filterState$.get(), draft => {
        const entityNameFilter = draft.find(f => f.field === 'entity-name');
        if (entityNameFilter) {
          entityNameFilter.value = query;
        } else {
          draft.unshift({ field: 'entity-name', value: query });
        }
      })
    );
  };

  setPageNumber = (pageNumber: number) => {
    this.pageNumber$.set(pageNumber);
  };

  setSelectedType = (type: SelectedType) => {
    this.selectedType$.set(type);
  };

  setNextPage = () => {
    // TODO: Bounds to the last page number
    this.pageNumber$.set(this.pageNumber$.get() + 1);
  };

  setPreviousPage = () => {
    const previousPageNumber = this.pageNumber$.get() - 1;
    if (previousPageNumber < 0) return;
    this.pageNumber$.set(previousPageNumber);
  };

  setFilterState = (filter: FilterState) => {
    const newState = filter.length === 0 ? initialFilterState() : filter;
    this.setPageNumber(0);
    this.filterState$.set(newState);
  };

  createForeignType = (foreignType: TripleType) => {
    CreateType.createForeignType(
      foreignType,
      this.spaceId,
      this.space$.spaceConfigEntityId.get(),
      this.ActionsStore.create
    );
  };

  createType = (entityName: string) => {
    return CreateType.createType(entityName, this.spaceId, this.ActionsStore.create);
  };
}
