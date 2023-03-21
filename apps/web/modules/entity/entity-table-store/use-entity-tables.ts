'use client';
import { useSelector } from '@legendapp/state/react';

import { FilterState } from '../../types';
import { useEntityTableStore } from './entity-table-store-provider';

export const useEntityTable = () => {
  const {
    rows$,
    query$,
    setQuery,
    setPageNumber,
    setNextPage,
    setSelectedType,
    setPreviousPage,
    pageNumber$,
    hasPreviousPage$,
    hasNextPage$,
    filterState$,
    hydrated$,
    selectedType$,
    columns$,
    types$,
    unpublishedColumns$,
    columnValueType,
    setFilterState,
    columnName,
    createForeignType,
    createType,
  } = useEntityTableStore();
  const rows = useSelector(rows$);
  const columns = useSelector(columns$);
  const types = useSelector(types$);
  const hydrated = useSelector(hydrated$);
  const selectedType = useSelector(selectedType$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);
  const filterState = useSelector<FilterState>(filterState$);

  return {
    rows,
    columns,
    unpublishedColumns,
    types,
    query,
    hydrated,
    selectedType,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    setSelectedType,
    pageNumber,
    columnValueType,
    columnName,
    hasPreviousPage,
    hasNextPage,
    filterState,
    setFilterState,
    createType,
    createForeignType,
  };
};
