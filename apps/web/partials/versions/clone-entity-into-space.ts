import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Mutator } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

function signatureOf(relation: Relation): string {
  return `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${relation.toSpaceId ?? ''}|${
    relation.renderableType
  }`;
}

/**
 * Block/tab content lives on separate entities reached via BLOCKS/TABS
 * relations (other relations point at shared, cross-space entities). Walk that
 * subtree from `rootEntityId` so the caller can reproduce it in the target
 * space:
 * - entityIds: every block/tab entity (its values + outgoing relations)
 * - relationFromIds: entityIds plus each containment relation's *relation
 *   entity* id, which is where the data block view/shown-columns config hangs.
 */
export function collectSubtree(rootEntityId: string, sourceSpaceId: string) {
  const entityIds = new Set<string>([rootEntityId]);
  const relationFromIds = new Set<string>([rootEntityId]);
  const queue = [rootEntityId];

  while (queue.length > 0) {
    const entityId = queue.pop()!;

    const containment = getRelations({
      selector: r =>
        r.fromEntity.id === entityId &&
        r.spaceId === sourceSpaceId &&
        (r.type.id === SystemIds.BLOCKS || r.type.id === SystemIds.TABS_PROPERTY),
    });

    for (const relation of containment) {
      relationFromIds.add(relation.entityId);

      const childId = relation.toEntity.id;
      if (!entityIds.has(childId)) {
        entityIds.add(childId);
        relationFromIds.add(childId);
        queue.push(childId);
      }
    }
  }

  return { entityIds, relationFromIds };
}

export function cloneEntityIntoSpace(entityId: string, sourceSpaceId: string, targetSpaceId: string, storage: Mutator) {
  const { entityIds, relationFromIds } = collectSubtree(entityId, sourceSpaceId);

  const sourceValues = getValues({
    selector: value => entityIds.has(value.entity.id) && value.spaceId === sourceSpaceId,
  });

  const sourceRelations = getRelations({
    selector: relation => relationFromIds.has(relation.fromEntity.id) && relation.spaceId === sourceSpaceId,
  });

  const existingTargetValueIds = new Set(
    getValues({
      selector: value => entityIds.has(value.entity.id) && value.spaceId === targetSpaceId,
    }).map(value => value.id)
  );

  const existingTargetRelationSignatures = new Set(
    getRelations({
      selector: relation => relationFromIds.has(relation.fromEntity.id) && relation.spaceId === targetSpaceId,
    }).map(signatureOf)
  );

  sourceValues.forEach(value => {
    const id = ID.createValueId({
      entityId: value.entity.id,
      propertyId: value.property.id,
      spaceId: targetSpaceId,
    });

    if (existingTargetValueIds.has(id)) return;

    storage.values.set({
      ...value,
      id,
      spaceId: targetSpaceId,
      entity: { ...value.entity },
      property: { ...value.property },
    });
  });

  sourceRelations.forEach(relation => {
    if (existingTargetRelationSignatures.has(signatureOf(relation))) return;

    // Preserve `entityId` (the relation entity): data block view/shown-columns
    // config hangs off it, and the renderer resolves that config by this id.
    // Only `id` (the store key) must be fresh to avoid clobbering the source.
    storage.relations.set({
      ...relation,
      id: IdUtils.generate(),
      spaceId: targetSpaceId,
      fromEntity: { ...relation.fromEntity },
      toEntity: { ...relation.toEntity },
      type: { ...relation.type },
    });
  });
}
