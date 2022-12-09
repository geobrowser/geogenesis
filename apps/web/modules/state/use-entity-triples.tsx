import { useSelector } from '@legendapp/state/react';
import { useEntityStore } from './entity-store-provider';

export function useEntityTriples() {
  const { create, publish, entityNames$, triples$, actions$, update } = useEntityStore();
  const entityNames = useSelector(entityNames$);
  const triples = useSelector(triples$);
  const actions = useSelector(actions$);

  return {
    triples,
    entityNames,
    actions,
    create,
    update,
    publish,
  };
}
