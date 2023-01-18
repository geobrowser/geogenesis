import { useSelector } from '@legendapp/state/react';
import { Triple } from '~/modules/types';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityStore() {
  const { create, triples$, schemaTriples$, update, remove, hideSchema, hiddenSchemaIds$, linkedEntities$, name$ } =
    useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<Triple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);
  const linkedEntities = useSelector(linkedEntities$);
  const name = useSelector(name$);

  return {
    name,
    triples,
    linkedEntities,
    schemaTriples,
    create,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds,
  };
}
