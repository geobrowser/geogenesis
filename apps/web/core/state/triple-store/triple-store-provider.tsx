'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { Services } from '~/core/services';

import { useActionsStoreInstance } from '../actions-store/actions-store-provider';
import { InitialTripleStoreParams, TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

interface Props {
  space: string;
  initialParams: InitialTripleStoreParams;
  children: React.ReactNode;
}

export function TripleStoreProvider({ space, children, initialParams }: Props) {
  const { subgraph, config } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();

  const store = useMemo(() => {
    return new TripleStore({ subgraph, config, space, initialParams, ActionsStore });
  }, [subgraph, config, space, ActionsStore, initialParams]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStoreInstance() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
