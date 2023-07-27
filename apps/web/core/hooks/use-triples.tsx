'use client';

import { useSelector } from '@legendapp/state/react';

import { useTripleStoreInstance } from '../state/triple-store/triple-store-provider';
import { FilterState } from '../types';

export const useTriples = () => {
  const {
    triples$,
    query$,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    pageNumber$,
    hasPreviousPage$,
    hasNextPage$,
    filterState$,
    hydrated$,
    setFilterState,
  } = useTripleStoreInstance();
  const triples = useSelector(triples$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const hydrated = useSelector(hydrated$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    triples,
    query,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    hydrated,
    pageNumber,
    hasPreviousPage,
    hasNextPage,
    filterState,
    setFilterState,
  };
};
