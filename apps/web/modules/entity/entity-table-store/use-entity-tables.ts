import { useSelector } from '@legendapp/state/react';

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
    hydrated$,
    selectedType$,
    columns$,
    unpublishedColumns$,
    createForeignType,
    createType,
  } = useEntityTableStore();
  const rows = useSelector(rows$);
  const columns = useSelector(columns$);
  const hydrated = useSelector(hydrated$);
  const selectedType = useSelector(selectedType$);
  const pageNumber = useSelector(pageNumber$);
  const hasPreviousPage = useSelector(hasPreviousPage$);
  const unpublishedColumns = useSelector(unpublishedColumns$);
  const hasNextPage = useSelector(hasNextPage$);
  const query = useSelector(query$);

  return {
    rows,
    columns,
    unpublishedColumns,
    query,
    hydrated,
    selectedType,
    setQuery,
    setPageNumber,
    setNextPage,
    setPreviousPage,
    setSelectedType,
    pageNumber,
    hasPreviousPage,
    hasNextPage,
    createType,
    createForeignType,
  };
};
