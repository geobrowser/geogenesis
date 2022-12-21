import { createContext, useContext, useMemo } from 'react';
import { useActionsStoreContext } from '../action';
import { Services } from '../services';
import { Triple } from '../types';
import { EntityStore } from './entity-store';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples }: Props) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new EntityStore({ api: network, spaceId, initialTriples, id, ActionsStore });
  }, [network, spaceId, initialTriples, id, ActionsStore]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreContext() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
