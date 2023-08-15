'use client';

import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';
import { setFilterState, setPage, setQuery } from '../state/triple-store/triple-store-slice';
import { FilterState } from '../types';
import { useGeoDispatch } from './use-dispatch';
import { useGeoSelector } from './use-selector';

const DEFAULT_PAGE_SIZE = 100;

export function useTriples({ spaceId }: { spaceId: string }) {
  const { subgraph, config } = Services.useServices();
  const state = useGeoSelector(state => state.triplesStore);
  const dispatch = useGeoDispatch();

  const { data: triples, isLoading } = useQuery({
    queryKey: ['triples-store', state.query, state.pageNumber, JSON.stringify(state.filterState)],
    queryFn: ({ signal }) =>
      subgraph.fetchTriples({
        query: state.query,
        endpoint: config.subgraph,
        filter: state.filterState,
        first: DEFAULT_PAGE_SIZE + 1,
        skip: state.pageNumber * DEFAULT_PAGE_SIZE,
        space: spaceId,
        signal,
      }),
  });

  return {
    triples: triples?.slice(0, DEFAULT_PAGE_SIZE) ?? [],
    pageNumber: state.pageNumber,
    query: state.query,
    filterState: state.filterState,
    hasNextPage: triples ? triples.length > DEFAULT_PAGE_SIZE : false,
    hasPreviousPage: state.pageNumber > 0,
    setFilterState: (filterState: FilterState) => dispatch(setFilterState(filterState)),
    setQuery: (query: string) => dispatch(setQuery(query)),
    setPage: (pageNumber: number) => dispatch(setPage(pageNumber)),
    hydrated: !isLoading,
  };
}
