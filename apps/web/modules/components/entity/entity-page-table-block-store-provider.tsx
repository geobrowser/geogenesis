import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { EntityTableStore } from '~/modules/entity';
import { useSpaceStore } from '~/modules/spaces/space-store';
import { Services } from '../../services';
import { Column, Row, Triple } from '../../types';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialRows: Row[];
  initialSelectedType: Triple | null;
  initialColumns: Column[];
}

// @TODO: how does this work if there's multiple tables on a page?
// Should it store an object of multiple stores?
export function EntityPageTableBlockStoreProvider({
  spaceId,
  children,
  initialRows,
  initialSelectedType,
  initialColumns,
}: Props) {
  const { network } = Services.useServices();
  const SpaceStore = useSpaceStore();
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new EntityTableStore({
      api: network,
      spaceId,
      initialRows,
      initialSelectedType,
      initialTypes: [],
      initialColumns,
      ActionsStore,
      SpaceStore,
    });
  }, [network, spaceId, initialRows, initialSelectedType, initialColumns, ActionsStore, SpaceStore]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityPageTableBlockStore() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
