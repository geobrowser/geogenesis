'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useActionsStoreInstance } from '../actions-store';
import { Services } from '~/core/services';
import { InitialTripleStoreParams, TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

interface Props {
  space: string;
  initialParams: InitialTripleStoreParams;
  children: React.ReactNode;
}

export function TripleStoreProvider({ space, children, initialParams }: Props) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();

  const store = useMemo(() => {
    return new TripleStore({ api: network, space, initialParams, ActionsStore });
  }, [network, space, ActionsStore, initialParams]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStoreInstance() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
