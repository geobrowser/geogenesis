import { useSelector } from '@legendapp/state/react';
import { Action } from '../types';
import { useEntityStore } from './entity-store-provider';

export function useEntityTriples() {
  const { create, publish, triples$, actions$, update, remove } = useEntityStore();
  const triples = useSelector(triples$);
  const actions = useSelector<Action[]>(actions$);

  return {
    triples,
    actions,
    create,
    update,
    remove,
    publish,
  };
}
