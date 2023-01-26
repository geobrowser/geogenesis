import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import produce from 'immer';
import { ActionsStore } from '~/modules/action';
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

          // We need to do the same for columns and columnsSchema :thinking:
          const localEntities = pipe(
            ActionStore.actions$.get(),
            actions => Entity.mergeActionsWithEntities(actions, Entity.entitiesFromTriples(serverRows)),
            A.tap(e => console.log('mergedEntities', e)),

            // HACK: This doesn't work reliably since the entity name might not be unique. We need to use
            // the type id here, but right now that breaks entity editing if you are editing the type field.
            A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId))
          );

          console.log('localEntities', localEntities);

          const localEntitiesIds = new Set(localEntities.map(e => e.id));

          const { rows, hasNextPage } = EntityTable.fromColumnsAndRows(
            space,
            [...localEntities.flatMap(e => e.triples), ...serverRows.filter(sr => !localEntitiesIds.has(sr.id))],
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
