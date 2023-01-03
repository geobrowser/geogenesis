import { useSelector } from '@legendapp/state/react';
import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Params } from '../params';
import { useServices } from '../services';
import { FilterState, Triple } from '../types';
import { TripleStore } from './triple-store';

const TripleStoreContext = createContext<TripleStore | undefined>(undefined);

interface Props {
  space: string;
  children: React.ReactNode;
  initialTriples: Triple[];
}

export function TripleStoreProvider({ space, children, initialTriples }: Props) {
  const { network } = useServices();
  const router = useRouter();
  const replace = useRef(router.replace);
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    const initialParams = Params.parseTripleQueryParameters(urlRef.current);

    return new TripleStore({ api: network, space, initialParams, initialTriples });
  }, [network, space, initialTriples]);

  const query = useSelector(store.query$);
  const pageNumber = useSelector(store.pageNumber$);

  // Legendstate has a hard time inferring observable array contents
  const filterState = useSelector<FilterState>(store.filterState$);

  // Update the url with query search params whenever query or page number changes
  useEffect(() => {
    replace.current(
      {
        pathname: basePath,
        query: Params.stringifyQueryParameters({ query, pageNumber, filterState }),
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [basePath, query, pageNumber, filterState]);

  return <TripleStoreContext.Provider value={store}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStore() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
