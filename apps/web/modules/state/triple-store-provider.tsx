import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services';
import { TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

export function TripleStoreProvider({ space, children }: { space: string; children: React.ReactNode }) {
  const { network } = useServices();
  const router = useRouter();
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    return new TripleStore({ api: network, space, initialRouter: { basePath, url: urlRef.current } });
  }, [network, space, basePath]);

  useEffect(() => {
    store.setRouter({ basePath, replace: router.replace, url: router.asPath });
  }, [router.replace, basePath, store, router]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStore() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
