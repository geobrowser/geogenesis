import { useRouter } from 'next/router';
import * as React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { EntityTableStore } from '~/modules/entity';
import { useSpaceStore } from '~/modules/spaces/space-store';
import { Params } from '../../params';
import { Services } from '../../services';
import { Column, FilterState, Row, Triple } from '../../types';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialRows: Row[];
  initialSelectedType: Triple | null;
  initialColumns: Column[];
  initialTypes: Triple[];
}

// @TODO: how does this work if there's multiple tables on a page?
export function EntityPageTableBlockStoreProvider({
  spaceId,
  children,
  initialRows,
  initialSelectedType,
  initialColumns,
  initialTypes,
}: Props) {
  const { network } = Services.useServices();
  const router = useRouter();
  const SpaceStore = useSpaceStore();
  const ActionsStore = useActionsStoreContext();
  const urlRef = useRef(router.asPath);

  const store = useMemo(() => {
    const initialParams = Params.parseEntityTableQueryParameters(urlRef.current);
    return new EntityTableStore({
      api: network,
      spaceId,
      initialParams,
      initialRows,
      initialSelectedType,
      initialColumns,
      initialTypes,
      ActionsStore,
      SpaceStore,
    });
  }, [network, spaceId, initialRows, initialSelectedType, initialColumns, initialTypes, ActionsStore, SpaceStore]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityPageTableBlockStore() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
