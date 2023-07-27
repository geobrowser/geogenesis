'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useActionsStoreInstance } from '../../action';
import { Services } from '../../services/services';
import { Triple } from '../../types';
import { EntityStore } from './entity-store';
import { LocalData } from '~/core/io';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialSchemaTriples: Triple[];
  initialBlockIdsTriple: Triple | null;
  initialBlockTriples: Triple[];
}

export function EntityStoreProvider({
  id,
  spaceId,
  children,
  initialBlockIdsTriple,
  initialBlockTriples,
  initialTriples,
  initialSchemaTriples,
}: Props) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = LocalData.useLocalStoreInstance();

  const store = useMemo(() => {
    return new EntityStore({
      api: network,
      spaceId,
      initialBlockIdsTriple,
      initialBlockTriples,
      initialTriples,
      initialSchemaTriples,
      id,
      ActionsStore,
      LocalStore,
    });
  }, [
    network,
    spaceId,
    initialBlockTriples,
    initialTriples,
    initialBlockIdsTriple,
    initialSchemaTriples,
    id,
    ActionsStore,
    LocalStore,
  ]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
