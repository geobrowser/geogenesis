// HACK: This is a temporary mechanism to keep track of all changes across entity stores
import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { EntityStore } from './entity-store';

export const entityStores$ = observable<Record<string, EntityStore>>({});
export const addStore = (id: string, store: EntityStore) => {
  entityStores$.set({
    ...entityStores$.get(),
    [id]: store,
  });
};

export function useEntityStores() {
  const stores = useSelector(entityStores$);

  return {
    stores,
  };
}
