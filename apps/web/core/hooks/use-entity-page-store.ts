'use client';

import { useSelector } from '@legendapp/state/react';
import { useQuery } from '@tanstack/react-query';
import { pipe } from 'effect';

import { Action, Triple as ITriple } from '~/core/types';

import { Services } from '../services';
import { useEntityStoreInstance } from '../state/entity-page-store';
import { Triple } from '../utils/triple';
import { Value } from '../utils/value';
import { useActionsStore } from './use-actions-store';

type RelationValueType = {
  typeId: string;
  typeName: string | null;
  spaceId: string;
};

type RelationValueTypesByAttributeId = Record<string, Array<RelationValueType>>;

/**
 * This function takes triples from the server for the relation value types and merges them with any locally
 * created/deleted relation value types before mapping them to the RelationValueType data structure that the UI
 * expects to consume.
 */
export const mergeTriplesToRelationValueTypes = (
  actions: Array<Action>,
  relationTypeTriples: Array<ITriple>
): RelationValueTypesByAttributeId => {
  const mergedTriples = Triple.fromActions(actions, relationTypeTriples);

  return pipe(
    mergedTriples,
    triples => triples.filter(Value.isRelationValueType),
    triples =>
      triples.reduce<RelationValueTypesByAttributeId>((acc, relationType) => {
        if (!acc[relationType.entityId]) acc[relationType.entityId] = [];

        acc[relationType.entityId].push({
          typeId: relationType.value.id,
          typeName: relationType.value.name,
          spaceId: relationType.space,
        });

        return acc;
      }, {})
  );
};

/**
 * This function is responsible for fetching the attribute relation value types for the triples
 * and schema triples that make up an entity on the entity page. It merges any remote relation
 * value types and merges them with any local actions that have acted on the relation value types
 * for this entity.
 *
 * It returns an object that maps attribute ids to an array of relation value types.
 */
function useConfiguredAttributeRelationTypes({
  triples,
  schemaTriples,
}: {
  triples: Array<ITriple>;
  schemaTriples: Array<ITriple>;
}): Record<string, Array<RelationValueType>> {
  const attributesWithRelationValues = [
    ...new Set([...triples, ...schemaTriples].filter(t => t.value.type === 'entity').map(t => t.attributeId)),
  ];

  const { subgraph, config } = Services.useServices();
  const { allActions } = useActionsStore();

  const {
    data: serverAttributeRelationTypes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['serverAttributeRelationTypes', attributesWithRelationValues],
    queryFn: async () =>
      Promise.all(
        attributesWithRelationValues.map(attributeId =>
          subgraph.fetchEntity({ id: attributeId, endpoint: config.subgraph })
        )
      ),
  });

  if (!serverAttributeRelationTypes || isLoading || error) {
    return {};
  }

  // We need to merge any local actions for the attribute relation types with the server attribute relation types.
  // Additionally we map to the data structure the UI expects to consume.
  return mergeTriplesToRelationValueTypes(
    allActions,
    // Filter out any non-existent entities
    serverAttributeRelationTypes.flatMap(e => (e ? [e] : [])).flatMap(e => e.triples.filter(Value.isRelationValueType))
  );
}

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
  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ triples, schemaTriples });

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
