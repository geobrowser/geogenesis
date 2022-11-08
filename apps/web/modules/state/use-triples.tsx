'use client';

import { useSelector } from '@legendapp/state/react';
import { FilterState } from '../types';
import { useTripleStore } from './triple-store-provider';

export const useTriples = () => {
  const {
    create,
    update,
    publish,
    triples$,
    query$,
    actions$,
    entityNames$,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    pageNumber$,
    hasPreviousPage$,
    hasNextPage$,
    filterState$,
    setFilterState,
  } = useTripleStore();
  const triples = useSelector(triples$);
  const actions = useSelector(actions$);
  const entityNames = useSelector(entityNames$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    triples,
    actions,
    entityNames,
    create,
    update,
    publish,
    query,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    pageNumber,
    hasPreviousPage,
    hasNextPage,
    filterState,
    setFilterState,
  };
};
