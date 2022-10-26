import { observe } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services';
import { TripleStore } from './triple-store';
import * as params from '../params';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

export function TripleStoreProvider({ space, children }: { space: string; children: React.ReactNode }) {
  const { network } = useServices();
  const router = useRouter();
  const replace = useRef(router.replace);
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    const initialParams = params.parseQueryParameters(urlRef.current);
    return new TripleStore({ api: network, space, initialParams });
  }, [network, space]);

  const query = useSelector(store.query$);
  const pageNumber = useSelector(store.pageNumber$);

  // Update the url with query search params whenever query or page number changes
  useEffect(() => {
    replace.current(
      {
        pathname: basePath,
        query: params.stringifyQueryParameters({ query, pageNumber }),
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [basePath, query, pageNumber]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStore() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
