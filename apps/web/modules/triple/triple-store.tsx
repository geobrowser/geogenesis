import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';

import { ActionsStore } from '../action';
import { NetworkData } from '~/modules/io';
import { Triple } from '../triple';
import { FilterState, Triple as TripleType } from '../types';
import { makeOptionalComputed } from '../utils';

interface ITripleStore {
  triples$: ObservableComputed<TripleType[]>;
  pageNumber$: Observable<number>;
  hydrated$: Observable<boolean>;
  query$: Observable<string>;
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
  api: NetworkData.INetwork;
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
  return [];
}

export class TripleStore implements ITripleStore {
  private api: NetworkData.INetwork;
  triples$: ObservableComputed<TripleType[]> = observable([]);
  pageNumber$: Observable<number>;
  query$: Observable<string>;
  filterState$: Observable<FilterState>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hydrated$: Observable<boolean> = observable(false);
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
      initialParams.filterState.length === 0 ? initialFilterState() : initialParams.filterState
    );
    this.space = space;
    this.query$ = observable(initialParams.query);

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

          this.hydrated$.set(true);
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
      const actions = ActionsStore.actions$.get()[space] ?? [];

      // We want to merge any local actions with the network triples
      const updatedTriples = Triple.fromActions(actions, networkTriples);
      return Triple.withLocalNames(actions, updatedTriples);
    });
  }

  setQuery = (query: string) => {
    this.query$.set(query);
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
    const newState = filter.length === 0 ? initialFilterState() : filter;
    this.setPageNumber(0);
    this.filterState$.set(newState);
  };
}
