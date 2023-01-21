import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { Signer } from 'ethers';
import produce from 'immer';
import { ActionsStore } from '~/modules/action';
import { INetwork } from '../../services/network';
import { Action, Column, CreateTripleAction, FilterState, ReviewState, Row, Triple as TripleType } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { InitialEntityTableStoreParams } from './entity-table-store-params';
import { fromColumnsAndRows } from './Table';

interface IEntityTableStore {
  actions$: Observable<Action[]>;
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  types$: ObservableComputed<TripleType[]>;
  selectedType$: Observable<Triple | null>;
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hydrated$: Observable<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  create(triples: TripleType[]): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

interface IEntityTableStoreConfig {
  api: INetwork;
  space: string;
  initialParams?: InitialEntityTableStoreParams;
  pageSize?: number;
  initialRows: Row[];
  initialSelectedType: Triple | null;
  initialTypes: Triple[];
  initialColumns: Column[];
  ActionsStore: ActionsStore;
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
  actions$: Observable<Action[]> = observable<Action[]>([]);
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  hydrated$: Observable<boolean> = observable(false);
  pageNumber$: Observable<number>;
  selectedType$: Observable<Triple | null>;
  types$: ObservableComputed<TripleType[]>;
  query$: ObservableComputed<string>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  space: string;
  abortController: AbortController = new AbortController();
  ActionsStore: ActionsStore;

  constructor({
    api,
    space,
    initialRows,
    initialSelectedType,
    initialColumns,
    initialTypes,
    ActionsStore,
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
    this.ActionsStore = ActionsStore;

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

          const { columns: serverColumns } = await this.api.columns({
            spaceId: space,
            params,
            abortController: this.abortController,
          });

          const { rows: serverRows } = await this.api.rows({
            spaceId: space,
            params,
            columns: serverColumns,
            abortController: this.abortController,
          });

          // Triple.fromAction
          // Entity.fromTriples
          // Row.fromEntity
          // Row.fromActions that replaces the list of rows in place
          // We need to do the same for columns :thinking:

          const { rows, hasNextPage } = fromColumnsAndRows(space, serverRows, serverColumns);

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

  create = (triples: TripleType[]) => {
    const actions: CreateTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'createTriple',
    }));

    this.actions$.set([...this.actions$.get(), ...actions]);
  };

  publish = async (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    await this.api.publish({ actions: this.actions$.get(), signer, onChangePublishState, space: this.space });
    this.setQuery('');
    this.actions$.set([]);
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

  setType = (type: Triple) => {
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
