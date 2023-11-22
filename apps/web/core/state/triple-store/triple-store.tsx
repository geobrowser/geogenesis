'use client';

import { useQuery } from '@tanstack/react-query';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Services } from '~/core/services';
import { FilterState, Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';

import { DEFAULT_PAGE_SIZE } from './constants';
import { useTripleStoreInstance } from './triple-store-provider';

export type InitialTripleStoreParams = {
  query: string;
  pageNumber: number;
  filterState: FilterState;
};

export function initialFilterState(): FilterState {
  return [];
}

const queryAtom = atom('');
const pageNumberAtom = atom(0);
const filterStateAtom = atom<FilterState>([]);

export function useTriples({ pageSize = DEFAULT_PAGE_SIZE }: { pageSize?: number } = {}) {
  const { subgraph, config } = Services.useServices();
  const { initialParams, space } = useTripleStoreInstance();
  const { actions } = useActionsStore();
  const hydrated = React.useRef(false);

  const [query, setQuery] = useAtom(queryAtom);
  const [pageNumber, setPageNumber] = useAtom(pageNumberAtom);
  const [filterState, setFilter] = useAtom(filterStateAtom);

  React.useEffect(() => {
    setQuery(initialParams.query);
    setPageNumber(initialParams.pageNumber);

    const initialFilter = initialParams.filterState.length === 0 ? initialFilterState() : initialParams.filterState;
    setFilter(initialFilter);
  }, [initialParams, setQuery, setPageNumber, setFilter]);

  const { data: networkData, isLoading } = useQuery({
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
    setPageNumber(prev => prev + 1);
  }, [setPageNumber]);

  const setPreviousPage = React.useCallback(() => {
    setPageNumber(prev => {
      if (prev - 1 < 0) return 0;
      return prev - 1;
    });
  }, [setPageNumber]);

  const setFilterState = React.useCallback(
    (newFilter: FilterState) => {
      const newState = newFilter.length === 0 ? initialFilterState() : newFilter;
      setPageNumber(0);
      setFilter(newState);
    },
    [setFilter, setPageNumber]
  );

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

    hydrated: !isLoading,
  };
}
