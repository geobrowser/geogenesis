import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, placeholderTriples$, update, remove } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const placeholderTriples = useSelector(placeholderTriples$);

  return {
    triples,
    placeholderTriples,
    create,
    update,
    remove,
  };
}
