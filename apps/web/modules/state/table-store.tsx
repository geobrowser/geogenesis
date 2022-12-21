import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { Signer } from 'ethers';
import produce from 'immer';
import { fetchEntityTableData } from '~/pages/space/[id]/entities';
import { INetwork } from '../services/network';
import {
  Action,
  Column,
  CreateTripleAction,
  FilterState,
  ReviewState,
  Row,
  Triple,
  Triple as TripleType,
} from '../types';
import { makeOptionalComputed } from '../utils';

interface ITableStore {
  actions$: Observable<Action[]>;
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  types$: ObservableComputed<TripleType[]>;
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  create(triples: TripleType[]): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

export type InitialTableStoreParams = {
  query: string;
  pageNumber: number;
  filterState: FilterState;
  typeId: string;
};

interface ITableStoreConfig {
  api: INetwork;
  space: string;
  initialParams?: InitialTableStoreParams;
  pageSize?: number;
  initialRows: Row[];
  initialType: Triple;
  initialTypes: TripleType[];
  initialColumns: Column[];
}

export const DEFAULT_PAGE_SIZE = 100;
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

export class TableStore implements ITableStore {
  private api: INetwork;
  actions$: Observable<Action[]> = observable<Action[]>([]);
  rows$: ObservableComputed<Row[]> = observable([]);
  pageNumber$: Observable<number>;
  type$: Observable<Triple>;
  columns$: ObservableComputed<Column[]>;
  types$: ObservableComputed<TripleType[]>;
  query$: ObservableComputed<string>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  space: string;

  constructor({
    api,
    space,
    initialRows,
    initialType,
    initialColumns,
    initialTypes,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: ITableStoreConfig) {
    this.api = api;
    this.rows$ = observable(initialRows);
    this.type$ = observable(initialType);
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
      { triples: [], hasNextPage: false },
      computed(async () => {
        try {
          fetchEntityTableData({
            typeEntityId: initialParams.typeId,
            spaceId: space,
            initialParams,
            network: this.api,
          });

          const { triples } = await this.api.fetchTriples({
            query: this.query$.get(),
            space: this.space,
            skip: this.pageNumber$.get() * pageSize,
            first: pageSize + 1,
            filter: this.filterState$.get(),
          });

          return { triples: triples.slice(0, pageSize), hasNextPage: triples.length > pageSize };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return new Promise(() => {});
          }

          // TODO: Real error handling

          return { triples: [], hasNextPage: false };
        }
      })
    );

    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);
    this.hasNextPage$ = computed(() => networkData$.get().hasNextPage);
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
    this.type$.set(type);
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
