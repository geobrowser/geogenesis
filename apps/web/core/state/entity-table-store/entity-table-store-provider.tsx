'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { Services } from '~/core/services';
import { useActionsStoreInstance } from '~/core/state/actions-store';
import { useSpaceStoreInstance } from '~/core/state/spaces-store';
import { Column, Row, Triple } from '~/core/types';

import { useLocalStoreInstance } from '../local-store';
import { EntityTableStore } from './entity-table-store';
import { InitialEntityTableStoreParams } from './entity-table-store-params';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialSelectedType: Triple | null;
  initialParams: InitialEntityTableStoreParams;
  initialColumns: Column[];
  initialRows: Row[];
}

export function EntityTableStoreProvider({
  spaceId,
  children,
  initialSelectedType,
  initialParams,
  initialColumns,
  initialRows,
}: Props) {
  const { network } = Services.useServices();
  const SpaceStore = useSpaceStoreInstance();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = useLocalStoreInstance();

  const store = useMemo(() => {
    return new EntityTableStore({
      api: network,
      spaceId,
      initialParams,
      initialSelectedType,
      ActionsStore,
      SpaceStore,
      LocalStore,
      initialColumns,
      initialRows,
    });
  }, [
    network,
    spaceId,
    initialSelectedType,
    ActionsStore,
    SpaceStore,
    LocalStore,
    initialParams,
    initialColumns,
    initialRows,
  ]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityTableStoreInstance() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error('Missing EntityTableStoreProvider');
  }

  return value;
}
