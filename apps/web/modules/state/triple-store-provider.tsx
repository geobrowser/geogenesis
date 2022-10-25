import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useServices } from '../services';
import { TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

export function TripleStoreProvider({ space, children }: { space: string; children: React.ReactNode }) {
  const { network } = useServices();
  const store = useMemo(() => new TripleStore({ api: network, space }), [network, space]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStore() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
