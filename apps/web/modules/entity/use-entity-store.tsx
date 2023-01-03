import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, update, remove } = useEntityStoreContext();
  const triples = useSelector(triples$);

  return {
    triples,
    create,
    update,
    remove,
  };
}
