import { useSelector } from '@legendapp/state/react';
import { FilterState } from '../types';
import { useTripleStore } from './triple-store-provider';

export const useTriples = () => {
  const {
    create,
    publish,
    triples$,
    query$,
    actions$,
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
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    triples,
    actions,
    create,
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
