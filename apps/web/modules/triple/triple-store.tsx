import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import { A } from '@mobily/ts-belt';
import produce from 'immer';
import { ActionsStore } from '../action';
import { INetwork } from '../services/network';
import { Triple } from '../triple';
import { FilterState, Triple as TripleType } from '../types';
import { makeOptionalComputed } from '../utils';

interface ITripleStore {
  triples$: ObservableComputed<TripleType[]>;
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

export type InitialTripleStoreParams = {
  query: string;
  pageNumber: number;
  filterState: FilterState;
};

interface ITripleStoreConfig {
  api: INetwork;
  space: string;
  ActionsStore: ActionsStore;
  initialParams?: InitialTripleStoreParams;
  pageSize?: number;
  initialTriples: TripleType[];
}

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_INITIAL_PARAMS = {
  query: '',
  pageNumber: 0,
  filterState: [],
};

export function initialFilterState(): FilterState {
  return [
    {
      field: 'entity-name',
      value: '',
    },
  ];
}

export class TripleStore implements ITripleStore {
  private api: INetwork;
  triples$: ObservableComputed<TripleType[]> = observable([]);
  pageNumber$: Observable<number>;
  query$: ObservableComputed<string>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  space: string;
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();

  constructor({
    api,
    space,
    initialTriples,
    ActionsStore,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: ITripleStoreConfig) {
    this.api = api;
    this.ActionsStore = ActionsStore;
    this.triples$ = observable(initialTriples);
    this.pageNumber$ = observable(initialParams.pageNumber);
    this.filterState$ = observable<FilterState>(
      A.isEmpty(initialParams.filterState) ? initialFilterState() : initialParams.filterState
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
          this.abortController.abort();
          this.abortController = new AbortController();

          const { triples } = await this.api.fetchTriples({
            query: this.query$.get(),
            space: this.space,
            skip: this.pageNumber$.get() * pageSize,
            first: pageSize + 1,
            filter: this.filterState$.get(),
            abortController: this.abortController,
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

    this.triples$ = computed(() => {
      const { triples: networkTriples } = networkData$.get();
      const actions = ActionsStore.actions$.get()[space];

      // We want to merge any local actions with the network triples
      return Triple.fromActions(space, actions, networkTriples);
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
    const newState = A.isEmpty(filter) ? initialFilterState() : filter;
    this.setPageNumber(0);
    this.filterState$.set(newState);
  };
}
