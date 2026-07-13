import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

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

function isMediaUrl(value: string | undefined): value is string {
  return typeof value === 'string' && (value.startsWith('ipfs://') || value.startsWith('http'));
}

export function cloneEntityIntoSpace(entityId: string, sourceSpaceId: string, targetSpaceId: string, storage: Mutator) {
  const { entityIds, relationFromIds } = collectSubtree(entityId, sourceSpaceId);

  // Cover/avatar/image properties point at a standalone image or video entity
  // that holds the ipfs:// url, and values are space-scoped. Cloning the
  // relation alone leaves the target space pointing at media it can't resolve,
  // so carry those entities' own data across too.
  const mediaRelations = getRelations({
    selector: relation =>
      relationFromIds.has(relation.fromEntity.id) &&
      relation.spaceId === sourceSpaceId &&
      (relation.renderableType === 'IMAGE' || relation.renderableType === 'VIDEO'),
  });

  const mediaEntityIds = new Set(mediaRelations.map(r => r.toEntity.id).filter(id => !entityIds.has(id)));

  const valueEntityIds = new Set([...entityIds, ...mediaEntityIds]);
  const relationSourceIds = new Set([...relationFromIds, ...mediaEntityIds]);

  const sourceValues = getValues({
    selector: value => valueEntityIds.has(value.entity.id) && value.spaceId === sourceSpaceId,
  });

  const sourceRelations = getRelations({
    selector: relation => relationSourceIds.has(relation.fromEntity.id) && relation.spaceId === sourceSpaceId,
  });

  const existingTargetValueIds = new Set(
    getValues({
      selector: value => valueEntityIds.has(value.entity.id) && value.spaceId === targetSpaceId,
    }).map(value => value.id)
  );

  const existingTargetRelationSignatures = new Set(
    getRelations({
      selector: relation => relationSourceIds.has(relation.fromEntity.id) && relation.spaceId === targetSpaceId,
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

  // An already-published media entity often isn't in the store at all. Only the
  // relation pointing at it is, carrying the url on `toEntity.value`, so the
  // copies above found nothing to clone. Rebuild it in the target space the way
  // an upload there would: the ipfs:// url plus the Types relation that marks
  // it as an image or video.
  // Keyed by media entity, not by relation: cover and avatar can point at the
  // same image, and rebuilding it once per relation would write a second Types
  // relation (the dedup sets below are snapshotted before any of these writes).
  const mediaEntitiesToRebuild = new Map(
    mediaRelations
      .filter(relation => mediaEntityIds.has(relation.toEntity.id) && isMediaUrl(relation.toEntity.value))
      .map(relation => [relation.toEntity.id, relation] as const)
  );

  mediaEntitiesToRebuild.forEach((relation, mediaEntityId) => {
    const url = relation.toEntity.value;

    const isVideo = relation.renderableType === 'VIDEO';
    const hasUrl = sourceValues.some(value => value.entity.id === mediaEntityId && isMediaUrl(value.value));
    const hasType = sourceRelations.some(
      r => r.fromEntity.id === mediaEntityId && r.type.id === SystemIds.TYPES_PROPERTY
    );

    const valueId = ID.createValueId({
      entityId: mediaEntityId,
      propertyId: SystemIds.IMAGE_URL_PROPERTY,
      spaceId: targetSpaceId,
    });

    if (!hasUrl && !existingTargetValueIds.has(valueId)) {
      storage.values.set({
        id: valueId,
        entity: { id: mediaEntityId, name: null },
        property: { id: SystemIds.IMAGE_URL_PROPERTY, name: 'IPFS URL', dataType: 'TEXT' },
        spaceId: targetSpaceId,
        value: url,
      });
    }

    if (hasType) return;

    const typeId = isVideo ? SystemIds.VIDEO_TYPE : SystemIds.IMAGE_TYPE;

    const typeRelation: Relation = {
      id: IdUtils.generate(),
      entityId: ID.createEntityId(),
      fromEntity: { id: mediaEntityId, name: null },
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      toEntity: { id: typeId, name: isVideo ? 'Video' : 'Image', value: typeId },
      spaceId: targetSpaceId,
      position: Position.generate(),
      verified: false,
      renderableType: 'RELATION',
    };

    if (existingTargetRelationSignatures.has(signatureOf(typeRelation))) return;

    storage.relations.set(typeRelation);
  });
}
