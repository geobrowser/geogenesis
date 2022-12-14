import { createContext, useContext, useMemo } from 'react';
import { useServices } from '../services';
import { EntityNames, Triple } from '../types';
import { EntityStore } from './entity-store';
import { addStore } from './entity-stores';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples, initialEntityNames }: Props) {
  const { network } = useServices();

  const store = useMemo(() => {
    const newStore = new EntityStore({ api: network, spaceId, initialTriples, initialEntityNames, id });

    // HACK: This is a temporary workaround for tracking all changes across stores until we design the
    // changes page.
    addStore(id, newStore);
    return newStore;
  }, [network, spaceId, initialTriples, initialEntityNames, id]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStore() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
