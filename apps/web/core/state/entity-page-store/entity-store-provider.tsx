'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { Services } from '~/core/services';
import { Triple } from '~/core/types';

import { useActionsStoreInstance } from '../actions-store/actions-store-provider';
import { EntityStore } from './entity-store';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialSchemaTriples: Triple[];
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples, initialSchemaTriples }: Props) {
  const { subgraph, config } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();

  const store = useMemo(() => {
    return new EntityStore({
      spaceId,
      initialTriples,
      initialSchemaTriples,
      id,
      subgraph,
      config,
      ActionsStore,
    });
  }, [spaceId, initialTriples, initialSchemaTriples, id, ActionsStore, subgraph, config]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
