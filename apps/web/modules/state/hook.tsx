import { useSelector } from '@legendapp/state/react';
import { useTripleStore } from '../services';

export const useTriples = () => {
  const { create, update, publish, triples$, actions$, entityNames$, setQuery } = useTripleStore();
  const triples = useSelector(triples$);
  const actions = useSelector(actions$);
  const entityNames = useSelector(entityNames$);

  return {
    triples,
    actions,
    entityNames,
    create,
    update,
    publish,
    setQuery,
  };
};
