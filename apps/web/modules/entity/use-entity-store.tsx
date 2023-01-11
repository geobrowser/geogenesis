import { useSelector } from '@legendapp/state/react';
import { Triple } from '../types';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, schemaTriples$, update, remove, hideSchema, hiddenSchemaIds$ } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<Triple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);

  return {
    triples,
    schemaTriples,
    create,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds,
  };
}
