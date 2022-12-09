import { createContext, useContext, useMemo } from 'react';
import { useServices } from '../services';
import { EntityNames, Triple } from '../types';
import { EntityStore } from './entity-store';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export function EntityStoreProvider({ spaceId, children, initialTriples, initialEntityNames }: Props) {
  const { network } = useServices();

  const store = useMemo(() => {
    return new EntityStore({ api: network, spaceId, initialTriples, initialEntityNames });
  }, [network, spaceId, initialTriples, initialEntityNames]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStore() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
