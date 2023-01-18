import { createContext, useContext, useMemo } from 'react';
import { useActionsStoreContext } from '~/modules/action';
import { Services } from '~/modules/services';
import { Triple } from '~/modules/types';
import { EntityStore } from './entity-store';

const EntityStoreContext = createContext<EntityStore | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialSchemaTriples: Triple[];
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples, initialSchemaTriples }: Props) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new EntityStore({ api: network, spaceId, initialTriples, initialSchemaTriples, id, ActionsStore });
  }, [network, spaceId, initialTriples, initialSchemaTriples, id, ActionsStore]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreContext() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
