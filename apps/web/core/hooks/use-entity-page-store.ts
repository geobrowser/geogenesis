'use client';

import { useSelector } from '@legendapp/state/react';

import { Triple as ITriple } from '~/core/types';

import { useEntityStoreInstance } from '../state/entity-page-store';
import { useConfiguredAttributeRelationTypes } from './use-configured-attribute-relation-types';

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
  } = useEntityStoreInstance();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<ITriple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);
  const blockIds = useSelector<string[]>(blockIds$);
  const editorJson = useSelector(editorJson$);
  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: id });

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
