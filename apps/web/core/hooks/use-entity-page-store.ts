'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useSelector } from '@legendapp/state/react';
import { useQuery } from '@tanstack/react-query';

import { EntityValue, Triple as ITriple } from '~/core/types';

import { Services } from '../services';
import { useEntityStoreInstance } from '../state/entity-page-store';
import { Triple } from '../utils/triple';
import { useActionsStore } from './use-actions-store';

export function useConfiguredAttributeRelationTypes({
  triples,
  schemaTriples,
}: {
  triples: Array<ITriple>;
  schemaTriples: Array<ITriple>;
}) {
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
    queryFn: async () => {
      const result = await Promise.all(
        attributesWithRelationValues.map(attributeId =>
          subgraph.fetchEntity({ id: attributeId, endpoint: config.subgraph })
        )
      );

      return result.flatMap(r => (r ? [r] : []));
    },
  });

  if (!serverAttributeRelationTypes || isLoading || error) {
    return {};
  }

  // We need to merge any local actions for the attribute relation types with the server attribute relation types.
  // Additionally we map to the data structure the UI expects to consume.
  return Triple.fromActions(
    allActions,
    serverAttributeRelationTypes.flatMap(e => e.triples)
  )
    .filter(t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'entity')
    .reduce<Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>>((acc, relationType) => {
      if (!acc[relationType.entityId]) acc[relationType.entityId] = [];
      acc[relationType.entityId].push({
        typeId: relationType.value.id,
        // We can safely cast here because we filter for entity type values above.
        typeName: (relationType.value as EntityValue).name,
        spaceId: relationType.space,
      });
      return acc;
    }, {});
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
