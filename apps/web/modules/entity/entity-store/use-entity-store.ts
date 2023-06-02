import { useSelector } from '@legendapp/state/react';

import { Triple } from '~/modules/types';
import { useEntityStoreContext } from './entity-store-provider';

export function useEntityPageStore() {
  const {
    create,
    spaceId,
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
    attributeRelationTypes$,
  } = useEntityStoreContext();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<Triple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);
  const blockIds = useSelector<string[]>(blockIds$);
  const editorJson = useSelector(editorJson$);
  const attributeRelationTypes = useSelector(attributeRelationTypes$);

  return {
    triples,
    schemaTriples,
    spaceId,
    create,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds,
    updateEditorBlocks,
    editorJson,
    blockIds,
    id,
    attributeRelationTypes,
  };
}
