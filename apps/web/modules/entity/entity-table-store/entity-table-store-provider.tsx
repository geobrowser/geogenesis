import { useSelector } from '@legendapp/state/react';
import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useActionsStoreContext } from '~/modules/action';
import { Params } from '../../params';
import { Services } from '../../services';
import { Column, FilterState, Row, Triple } from '../../types';
import { EntityTableStore } from './entity-table-store';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  space: string;
  children: React.ReactNode;
  initialRows: Row[];
  initialSelectedType: Triple | null;
  initialColumns: Column[];
  initialTypes: Triple[];
}

export function EntityTableStoreProvider({
  space,
  children,
  initialRows,
  initialSelectedType,
  initialColumns,
  initialTypes,
}: Props) {
  const { network } = Services.useServices();
  const router = useRouter();
  const ActionStore = useActionsStoreContext();
  const replace = useRef(router.replace);
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    const initialParams = Params.parseEntityTableQueryParameters(urlRef.current);
    return new EntityTableStore({
      api: network,
      space,
      initialParams,
      initialRows,
      initialSelectedType,
      initialColumns,
      initialTypes,
      ActionStore,
    });
  }, [network, space, initialRows, initialSelectedType, initialColumns, initialTypes, ActionStore]);

  const query = useSelector(store.query$);
  const pageNumber = useSelector(store.pageNumber$);
  const selectedType = useSelector(store.selectedType$);
  const typeId = selectedType ? selectedType.entityId : '';

  // Legendstate has a hard time inferring observable array contents
  const filterState = useSelector<FilterState>(store.filterState$);

  // Update the url with query search params whenever query or page number changes
  useEffect(() => {
    replace.current(
      {
        pathname: basePath,
        query: Params.stringifyEntityTableParameters({ query, pageNumber, filterState, typeId }),
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [basePath, query, pageNumber, filterState, typeId]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityTableStore() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error(`Missing EntityTableStoreProvider`);
  }

  return value;
}
