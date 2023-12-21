import { SYSTEM_IDS } from '@geogenesis/ids';
import { pipe } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';
import { Action as IAction, Triple as ITriple, RelationValueTypesByAttributeId } from '../types';
import { Triple } from '../utils/triple';
import { Value } from '../utils/value';
import { useActionsStore } from './use-actions-store';

/**
 * This function takes triples from the server for the relation value types and merges them with any locally
 * created/deleted relation value types before mapping them to the RelationValueType data structure that the UI
 * expects to consume.
 */
export const mapMergedTriplesToRelationValueTypes = (
  actions: Array<IAction>,
  relationTypeTriples: Array<ITriple>
): RelationValueTypesByAttributeId => {
  // We need to re-merge local actions with the server triples since we don't re-run RQ in useConfiguredAttributeRelationTypes
  // when actions change.
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
          spaceIdOfAttribute: relationType.space,
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
export function useConfiguredAttributeRelationTypes({
  entityId,
}: {
  entityId: string;
}): RelationValueTypesByAttributeId {
  const { subgraph } = Services.useServices();
  const { allActions } = useActionsStore();

  const {
    data: serverAttributeRelationTypes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['server-attribute-relation-types-for-entity', entityId],
    queryFn: () =>
      // 1. Fetch all the triples for the entity
      // 2. Filter out the triples that are not relation value types
      subgraph.fetchTriples({
        query: '',
        skip: 0,
        first: 100,
        filter: [
          {
            field: 'attribute-id',
            value: SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
          },
          {
            field: 'entity-id',
            value: entityId,
          },
        ],
      }),
  });

  if (!serverAttributeRelationTypes || isLoading || error) {
    return {};
  }

  // We need to merge any local actions for the attribute relation types with the server attribute relation types.
  // Additionally we map to the data structure the UI expects to consume.
  return mapMergedTriplesToRelationValueTypes(
    allActions,
    // Flatten all the triples for each entity into a single array (there shouldn't be duplicates)
    serverAttributeRelationTypes
  );
}
