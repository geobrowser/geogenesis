'use client';

import { useSelector } from '@legendapp/state/react';

import { Triple as ITriple } from '~/core/types';

import { useEntityStoreInstance } from '../state/entity-page-store/entity-store-provider';
import { useConfiguredAttributeRelationTypes } from './use-configured-attribute-relation-types';

export function useEntityPageStore() {
  const { create, spaceId, triples$, schemaTriples$, update, remove, hideSchema, hiddenSchemaIds$, id, name$ } =
    useEntityStoreInstance();
  const triples = useSelector(triples$);
  const schemaTriples = useSelector<ITriple[]>(schemaTriples$);
  const hiddenSchemaIds = useSelector<string[]>(hiddenSchemaIds$);
  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: id });
  const name = useSelector(name$);

  return {
    triples,
    schemaTriples,
    spaceId,
    create,
    update,
    remove,
    hideSchema,
    hiddenSchemaIds,
    id,
    attributeRelationTypes,
    name,
  };
}
