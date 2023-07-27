'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { Services } from '~/core/services';

import { ActionsStore } from './actions-store';

export const ActionsStoreContext = createContext<ActionsStore | undefined>(undefined);

interface Props {
  children: React.ReactNode;
}

export function ActionsStoreProvider({ children }: Props) {
  const { network, storageClient } = Services.useServices();

  const store = useMemo(() => {
    return new ActionsStore({ api: network, storageClient });
  }, [network, storageClient]);

  return <ActionsStoreContext.Provider value={store}>{children}</ActionsStoreContext.Provider>;
}

export function useActionsStoreInstance() {
  const value = useContext(ActionsStoreContext);

  if (!value) {
    throw new Error(`Missing ActionsStoreProvider`);
  }

  return value;
}
