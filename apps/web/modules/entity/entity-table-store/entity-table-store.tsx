import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import produce from 'immer';
import { Action, ActionsStore } from '~/modules/action';
import { Triple } from '~/modules/triple';
import { Entity, EntityTable } from '..';
import { INetwork } from '../../services/network';
import { Column, FilterState, Row, Triple as TripleType } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { InitialEntityTableStoreParams } from './entity-table-store-params';

interface IEntityTableStore {
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  types$: ObservableComputed<TripleType[]>;
  selectedType$: Observable<TripleType | null>;
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hydrated$: Observable<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  ActionStore: ActionsStore;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

interface IEntityTableStoreConfig {
  api: INetwork;
  space: string;
  initialParams?: InitialEntityTableStoreParams;
  pageSize?: number;
  initialRows: Row[];
  initialSelectedType: TripleType | null;
  initialTypes: TripleType[];
  initialColumns: Column[];
  ActionStore: ActionsStore;
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

export class EntityTableStore implements IEntityTableStore {
  private api: INetwork;
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  hydrated$: Observable<boolean> = observable(false);
  pageNumber$: Observable<number>;
  selectedType$: Observable<TripleType | null>;
  types$: ObservableComputed<TripleType[]>;
  query$: ObservableComputed<string>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  space: string;
  ActionStore: ActionsStore;
  abortController: AbortController = new AbortController();

  constructor({
    api,
    space,
    initialRows,
    initialSelectedType,
    initialColumns,
    initialTypes,
    ActionStore,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: IEntityTableStoreConfig) {
    this.api = api;
    this.ActionStore = ActionStore;
    this.hydrated$ = observable(false);
    this.rows$ = observable(initialRows);
    this.selectedType$ = observable(initialSelectedType);
    this.pageNumber$ = observable(initialParams.pageNumber);
    this.columns$ = observable(initialColumns);
    this.types$ = observable(initialTypes);
    this.filterState$ = observable<FilterState>(
      initialParams.filterState.length === 0 ? initialFilterState() : initialParams.filterState
    );
    this.space = space;
    this.query$ = computed(() => {
      const filterState = this.filterState$.get();
      return filterState.find(f => f.field === 'entity-name')?.value || '';
    });

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], hasNextPage: false },
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

          const { columns: serverColumns, columnsSchema } = await this.api.columns({
            spaceId: space,
            params,
            abortController: this.abortController,
          });

          const { rows: serverRows } = await this.api.rows({
            spaceId: space,
            params,
            columns: serverColumns,
            columnsSchema,
            abortController: this.abortController,
          });

          /**
           * There are several edge-cases we need to handle in order to correctly merge local changes
           * with server data in the entity table:
           * 1. An entity is created locally and is given the selected type
           * 2. An entity is edited locally and is given the selected type
           *
           * Since the table aggregation code expects triples, we may end up in a situation where
           * the type for an entity has changed, but the name hasn't. In this case there is no local
           * version of the name triple, so we need to fetch it along with any other triples the table
           * needs to render the columnSchema.
           */
          const changedEntitiesIdsFromAnotherType = pipe(
            this.ActionStore.actions$.get()[space],
            actions => Triple.fromActions(actions, []),
            triples => Entity.entitiesFromTriples(triples),
            A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId)),
            A.map(t => t.id)
          );

          // Fetch any entities that have been changed locally and have the selected type to make sure we have all
          // of the triples necessary to build the table.
          const serverTriplesForEntitiesChangedLocally = await Promise.all(
            changedEntitiesIdsFromAnotherType.map(id =>
              this.api.fetchTriples({
                space,
                query: '',
                skip: 0,
                first: 100,
                filter: [
                  {
                    field: 'entity-id',
                    value: id,
                  },
                ],
              })
            )
          );

          // Merge any local changes to triples in an entity with the table rows from the server.
          const entitiesCreatedOrChangedLocally = pipe(
            this.ActionStore.actions$.get(),
            actions => Entity.mergeActionsWithEntities(actions, Entity.entitiesFromTriples(serverRows)),
            A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId))
          );

          const localEntitiesIds = new Set(entitiesCreatedOrChangedLocally.map(e => e.id));
          const serverEntitiesChangedLocallyIds = new Set(
            serverTriplesForEntitiesChangedLocally.flatMap(t => t.triples).map(t => t.entityId)
          );

          const filteredServerRows = serverRows.filter(
            sr => !localEntitiesIds.has(sr.entityId) && !serverEntitiesChangedLocallyIds.has(sr.entityId)
          );

          const { rows, hasNextPage } = EntityTable.fromColumnsAndRows(
            space,
            [
              // These are entities that were created locally and have the selected type
              ...entitiesCreatedOrChangedLocally.flatMap(e => e.triples),

              // These are entities that have a new type locally and may exist on the server.
              // We need to fetch all triples associated with this entity in order to correctly
              // populate the table.
              ...serverTriplesForEntitiesChangedLocally.flatMap(e => e.triples),

              // These are entities that have been fetched from the server and have the selected type
              ...filteredServerRows,
            ],
            serverColumns,
            columnsSchema
          );

          this.hydrated$.set(true);
          return { columns: serverColumns, rows: rows.slice(0, pageSize), hasNextPage };
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

    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);
    this.hasNextPage$ = computed(() => networkData$.get().hasNextPage);

    this.columns$ = computed(() => {
      const { columns } = networkData$.get();
      return columns;
    });

    this.rows$ = computed(() => {
      const { rows } = networkData$.get();
      return rows;
    });
  }

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

  setType = (type: TripleType) => {
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
}
