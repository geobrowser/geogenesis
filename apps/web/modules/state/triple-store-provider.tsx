'use client';

import { useSelector } from '@legendapp/state/react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import * as params from '../params';
import { useServices } from '../services';
import { TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

export function TripleStoreProvider({ space, children }: { space: string; children: React.ReactNode }) {
  const { network } = useServices();
  const router = useRouter();
  const replace = useRef(router.replace);
  const pathname = usePathname();
  const urlRef = useRef(pathname || '');

  const store = useMemo(() => {
    const initialParams = params.parseQueryParameters(urlRef.current);
    return new TripleStore({ api: network, space, initialParams });
  }, [network, space]);

  const query = useSelector(store.query$);
  const pageNumber = useSelector(store.pageNumber$);

  // Update the url with query search params whenever query or page number changes
  useEffect(() => {
    replace.current(`${pathname}?${params.stringifyQueryParameters({ query, pageNumber })}`);
  }, [pathname, query, pageNumber]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStore() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
