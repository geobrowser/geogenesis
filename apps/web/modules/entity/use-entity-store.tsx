import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, schemaTriples$, update, remove, hideSchema, hiddenSchemaIds$ } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector(schemaTriples$);
  const hiddenSchemaIds = useSelector(hiddenSchemaIds$);

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
