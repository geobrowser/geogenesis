import { useSelector } from '@legendapp/state/react';

import { Triple } from '~/modules/types';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityPageStore() {
  const {
    create,
    triples$,
    schemaTriples$,
    blockIds$,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds$,
    id,
    updateEditorBlocks,
    editorJson$,
  } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<Triple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);
  const blockIds = useSelector<string[]>(blockIds$);
  const editorJson = useSelector(editorJson$);

  return {
    triples,
    schemaTriples,
    create,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds,
    updateEditorBlocks,
    editorJson,
    blockIds,
    id,
  };
}
