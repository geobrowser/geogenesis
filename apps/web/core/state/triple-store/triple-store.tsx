import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Services } from '~/core/services';
import { FilterState, Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';

import { useTripleStoreInstance } from './triple-store-provider';

export type InitialTripleStoreParams = {
  query: string;
  pageNumber: number;
  filterState: FilterState;
};

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_INITIAL_PARAMS = {
  query: '',
  pageNumber: 0,
  filterState: [],
};

export function initialFilterState(): FilterState {
  return [];
}

const query$ = observable('');
const pageNumber$ = observable(0);
const filterState$ = observable<FilterState>([]);

export function useTriples({ pageSize = DEFAULT_PAGE_SIZE }: { pageSize?: number } = {}) {
  const { subgraph, config } = Services.useServices();
  const { initialParams, space } = useTripleStoreInstance();
  const { actions } = useActionsStore();
  const hydrated = React.useRef(false);

  const query = useSelector(query$);
  const pageNumber = useSelector(pageNumber$);
  const filterState = useSelector<FilterState>(filterState$);

  React.useEffect(() => {
    query$.set(initialParams.query);
    pageNumber$.set(initialParams.pageNumber);
    filterState$.set(initialParams.filterState.length === 0 ? initialFilterState() : initialParams.filterState);
  }, [initialParams]);

  const { data: networkData } = useQuery({
    queryKey: ['triples', space, query, filterState, pageNumber, pageSize],
    queryFn: async ({ signal }): Promise<{ triples: TripleType[]; hasNextPage: boolean }> => {
      try {
        const triples = await subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: query,
          space: space,
          skip: pageNumber * pageSize,
          first: pageSize + 1,
          filter: filterState,
          signal,
        });

        hydrated.current = true;
        return { triples: triples.slice(0, pageSize), hasNextPage: triples.length > pageSize };
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          return new Promise(() => {
            //
          });
        }

        // TODO: Real error handling
        return { triples: [], hasNextPage: false };
      }
    },
  });

  const triples = React.useMemo(() => {
    const networkTriples = networkData?.triples ?? [];
    const localActions = actions[space] ?? [];

    // We want to merge any local actions with the network triples
    const updatedTriples = Triple.fromActions(localActions, networkTriples);
    return Triple.withLocalNames(localActions, updatedTriples);
  }, [actions, networkData, space]);

  const setNextPage = React.useCallback(() => {
    pageNumber$.set(prev => prev + 1);
  }, []);

  const setPreviousPage = React.useCallback(() => {
    pageNumber$.set(prev => {
      if (prev - 1 < 0) return 0;
      return prev - 1;
    });
  }, []);

  const setFilterState = React.useCallback((newFilter: FilterState) => {
    const newState = newFilter.length === 0 ? initialFilterState() : newFilter;
    pageNumber$.set(0);
    filterState$.set(newState);
  }, []);

  const setQuery = React.useCallback((newQuery: string) => {
    query$.set(newQuery);
  }, []);

  const setPageNumber = React.useCallback((newPageNumber: number) => {
    pageNumber$.set(newPageNumber);
  }, []);

  return {
    triples,

    query,
    setQuery,

    hasNextPage: networkData?.hasNextPage ?? false,
    hasPreviousPage: pageNumber > 0,
    pageNumber,
    setPageNumber,
    setNextPage,
    setPreviousPage,

    filterState,
    setFilterState,

    hydrated: hydrated.current,
  };
}
