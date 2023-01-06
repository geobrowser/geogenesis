import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, schemaTriples$, update, remove } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector(schemaTriples$);

  return {
    triples,
    schemaTriples,
    create,
    update,
    remove,
  };
}
