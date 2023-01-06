import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, typeAttributes$, update, remove } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const typeAttributes = useSelector(typeAttributes$);

  return {
    triples,
    typeAttributes,
    create,
    update,
    remove,
  };
}
