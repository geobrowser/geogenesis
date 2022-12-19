import { useSelector } from '@legendapp/state/react';
import { FilterState } from '../types';
import { useTableStore } from './table-store-provider';

export const useTables = () => {
  const {
    create,
    publish,
    rows$,
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
  } = useTableStore();
  const rows = useSelector(rows$);
  const actions = useSelector(actions$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    rows,
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
