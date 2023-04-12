import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { EntityTableStore } from '~/modules/entity';
import { useSpaceStore } from '~/modules/spaces/space-store';
import { Services } from '~/modules/services';
import { Triple } from '~/modules/types';
import { useSelector } from '@legendapp/state/react';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialSelectedType: Triple | null;
}

// This component is used to wrap table blocks in the entity page
// and provide store context for the table to load and edit data
// for that specific table block.
//
// It works similarly to the EntityTableStoreProvider, but it's
// scoped specifically for table blocks and will have unique behavior
// in the future.
//
// @TODO
// 1. Reference to the configuration entity for the table block
// 2. New store implementation (instead of EntityTableStore). This is
//    so we explore new implementation for the table block that differs
//    from the entity page table.
export function EntityPageTableBlockStoreProvider({ spaceId, children, initialSelectedType }: Props) {
  const { network } = Services.useServices();
  const SpaceStore = useSpaceStore();
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new EntityTableStore({
      api: network,
      spaceId,
      initialRows: [],
      initialSelectedType,
      initialColumns: [],
      ActionsStore,
      SpaceStore,
    });
  }, [network, spaceId, initialSelectedType, ActionsStore, SpaceStore]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityPageTableBlockStore() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}

export function useEntityTableBlock() {
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
    columnValueType,
    setFilterState,
    columnName,
  } = useEntityPageTableBlockStore();
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
    columnValueType,
    columnName,
    hasPreviousPage,
    hasNextPage,
    setFilterState,
  };
}
