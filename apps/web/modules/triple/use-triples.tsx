import { useSelector } from '@legendapp/state/react';
import { FilterState } from '../types';
import { useTripleStoreContext } from './triple-store-provider';

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
    setFilterState,
  } = useTripleStoreContext();
  const triples = useSelector(triples$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    triples,
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
