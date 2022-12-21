import { useSelector } from '@legendapp/state/react';
import { useEntityStore } from './entity-store-provider';

export function useEntityTriples() {
  const { create, triples$, update, remove } = useEntityStore();
  const triples = useSelector(triples$);

  return {
    triples,
    create,
    update,
    remove,
  };
}
