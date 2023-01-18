import { createContext, useContext, useMemo } from 'react';
import { useActionsStoreContext } from '../../action';
import { Services } from '../../services';
import { EntityStore } from './entity-store';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
}

export function EntityStoreProvider({ id, spaceId, children }: Props) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new EntityStore({ api: network, spaceId, id, ActionsStore });
  }, [network, spaceId, id, ActionsStore]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreContext() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
