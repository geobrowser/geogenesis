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
    setType,
    setPreviousPage,
    pageNumber$,
    hasPreviousPage$,
    hasNextPage$,
    filterState$,
    type$,
    columns$,
    types$,
    setFilterState,
  } = useTableStore();
  const rows = useSelector(rows$);
  const actions = useSelector(actions$);
  const columns = useSelector(columns$);
  const types = useSelector(types$);
  const type = useSelector(type$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    rows,
    actions,
    columns,
    types,
    create,
    publish,
    query,
    type,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    setType,
    pageNumber,
    hasPreviousPage,
    hasNextPage,
    filterState,
    setFilterState,
  };
};
