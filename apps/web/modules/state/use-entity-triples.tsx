import { useSelector } from '@legendapp/state/react';
import { Action } from '../types';
import { useEntityStore } from './entity-store-provider';

export function useEntityTriples() {
  const { create, publish, entityNames$, triples$, actions$, update, remove } = useEntityStore();
  const entityNames = useSelector(entityNames$);
  const triples = useSelector(triples$);
  const actions = useSelector<Action[]>(actions$);

  return {
    triples,
    entityNames,
    actions,
    create,
    update,
    remove,
    publish,
  };
}
