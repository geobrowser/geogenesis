import { useSelector } from '@legendapp/state/react';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, schemaTriples$, update, remove, deleteSchemaId, deletedSchemaIds$ } =
    useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector(schemaTriples$);
  const deletedSchemaIds = useSelector(deletedSchemaIds$);

  return {
    triples,
    schemaTriples,
    create,
    update,
    remove,
    deleteSchemaId,
    deletedSchemaIds,
  };
}
