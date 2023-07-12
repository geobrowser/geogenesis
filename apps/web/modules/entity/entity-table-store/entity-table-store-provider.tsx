import { useSelector } from '@legendapp/state/react';
import { useRouter } from 'next/router';
import * as React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { useActionsStoreInstance } from '~/modules/action';
import { useSpaceStore } from '~/modules/spaces/space-store';
import { Params } from '../../params';
import { Services } from '../../services';
import { Column, Row, Triple } from '../../types';
import { EntityTableStore } from './entity-table-store';
import { LocalData } from '~/modules/io';

const EntityTableStoreContext = createContext<EntityTableStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialRows: Row[];
  initialSelectedType: Triple | null;
  initialColumns: Column[];
}

export function EntityTableStoreProvider({
  spaceId,
  children,
  initialRows,
  initialSelectedType,
  initialColumns,
}: Props) {
  const { network } = Services.useServices();
  const router = useRouter();
  const SpaceStore = useSpaceStore();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = LocalData.useLocalStoreInstance();
  const replace = useRef(router.replace);
  const urlRef = useRef(router.asPath);

  const basePath = router.asPath.split('?')[0];

  const store = useMemo(() => {
    const initialParams = Params.parseEntityTableQueryParameters(urlRef.current);
    return new EntityTableStore({
      api: network,
      spaceId,
      initialParams,
      initialRows,
      initialSelectedType,
      initialColumns,
      ActionsStore,
      SpaceStore,
      LocalStore,
    });
  }, [network, spaceId, initialRows, initialSelectedType, initialColumns, ActionsStore, SpaceStore, LocalStore]);

  const query = useSelector(store.query$);
  const pageNumber = useSelector(store.pageNumber$);
  const selectedType = useSelector(store.selectedType$);
  const typeId = selectedType ? selectedType.entityId : '';

  // Update the url with query search params whenever query or page number changes
  useEffect(() => {
    replace.current(
      {
        pathname: basePath,
        query: Params.stringifyEntityTableParameters({ query, pageNumber, filterState: [], typeId }),
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [basePath, query, pageNumber, typeId]);

  return <EntityTableStoreContext.Provider value={store}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityTableStoreInstance() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error('Missing EntityTableStoreProvider');
  }

  return value;
}
