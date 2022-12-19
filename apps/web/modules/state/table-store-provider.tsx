import { useSelector } from '@legendapp/state/react';
import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Params } from '../params';
import { useServices } from '../services';
import { FilterState, Row } from '../types';
import { TableStore } from './table-store';

const TableStoreContext = createContext<TableStore | undefined>(undefined);

interface Props {
  space: string;
  children: React.ReactNode;
  initialRows: Row[];
  initialTypeId: string;
}

export function TableStoreProvider({ space, children, initialRows, initialTypeId }: Props) {
  const { network } = useServices();
  const router = useRouter();
  const replace = useRef(router.replace);
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    const initialParams = Params.parseTripleQueryParameters(urlRef.current);
    return new TableStore({ api: network, space, initialParams, initialRows });
  }, [network, space, initialRows, initialTypeId]);

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

  return <TableStoreContext.Provider value={store}>{children}</TableStoreContext.Provider>;
}

export function useTableStore() {
  const value = useContext(TableStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
