import { useSelector } from '@legendapp/state/react';
import { FilterState } from '../types';
import { useEntityTableStore } from './entity-table-store-provider';

export const useEntityTable = () => {
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
    selectedType$,
    columns$,
    types$,
    setFilterState,
  } = useEntityTableStore();
  const rows = useSelector(rows$);
  const actions = useSelector(actions$);
  const columns = useSelector(columns$);
  const types = useSelector(types$);
  const selectedType = useSelector(selectedType$);
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
    selectedType,
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
