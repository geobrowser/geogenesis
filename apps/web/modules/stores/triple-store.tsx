import { computed, observable, Observable, ObservableComputed } from '@legendapp/state';
import produce from 'immer';
import { INetwork } from '../services/network';
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

  constructor({
    api,
    space,
    initialTriples,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: ITripleStoreConfig) {
    this.api = api;
    this.triples$ = observable(initialTriples);
    this.pageNumber$ = observable(initialParams.pageNumber);
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

    // TODO: We may care about rendering triples from actions
    this.triples$ = computed(() => networkData$.get().triples);
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
    const newState = filter.length === 0 ? initialFilterState() : filter;
    this.setPageNumber(0);
    this.filterState$.set(newState);
  };
}
