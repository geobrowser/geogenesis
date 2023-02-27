import { useSelector } from '@legendapp/state/react';

import { Triple } from '~/modules/types';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityPageStore() {
  const { create, triples$, schemaTriples$, update, remove, hideSchema, hiddenSchemaIds$, id } =
    useEntityStoreContext();
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
    id,
  };
}
