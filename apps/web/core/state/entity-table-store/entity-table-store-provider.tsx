'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { Services } from '~/core/services';
import { useActionsStoreInstance } from '~/core/state/actions-store';
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
  const { subgraph, config } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = useLocalStoreInstance();
  const { spaces } = useSpaces();

  const space = spaces.find(s => s.id === spaceId);

  const store = useMemo(() => {
    return new EntityTableStore({
      spaceId,
      initialParams,
      initialSelectedType,
      ActionsStore,
      space,
      LocalStore,
      initialColumns,
      initialRows,
      subgraph,
      config,
    });
  }, [
    spaceId,
    initialSelectedType,
    ActionsStore,
    space,
    LocalStore,
    initialParams,
    initialColumns,
    initialRows,
    subgraph,
    config,
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
