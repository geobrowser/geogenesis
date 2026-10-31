import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { getRelations, getValues } from '~/core/sync/use-store';
import type { Relation, Value } from '~/core/types';

import { collectSubtree } from './clone-entity-into-space';

/**
 * What to delete in the source space after a move's clone lands in the destination.
 *
 * Only this entity's own data in the source space — not backlinks (the id still exists), and not
 * the same values/relations in other spaces.
 *
 * `backlinks` are relations aimed at the subtree that the store may not hold, from
 * `loadMoveBacklinks`. A block stays when any of them still resolves to the source space.
 */
export function collectMoveDeletions(
  entityId: string,
  sourceSpaceId: string,
  backlinks: Relation[] = []
): { values: Value[]; relations: Relation[] } {
  const { entityIds: subtreeIds } = collectSubtree(entityId, sourceSpaceId);

  const containmentRelations = getRelations({
    selector: r =>
      subtreeIds.has(r.fromEntity.id) &&
      r.spaceId === sourceSpaceId &&
      (r.type.id === SystemIds.BLOCKS || r.type.id === SystemIds.TABS_PROPERTY),
  });
  const containmentRelationIds = new Set(containmentRelations.map(r => r.id));

  const keptIds = [...subtreeIds].filter(id => {
    if (id === entityId) return false;

    const externalRefs = getRelations({
      mergeWith: backlinks,
      selector: r =>
        r.toEntity.id === id && (r.toSpaceId ?? r.spaceId) === sourceSpaceId && !containmentRelationIds.has(r.id),
    });
    return externalRefs.length > 0;
  });

  const keptSubtreeIds = new Set(keptIds);
  const queue = [...keptIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const r of containmentRelations) {
      if (r.fromEntity.id === id && !keptSubtreeIds.has(r.toEntity.id)) {
        keptSubtreeIds.add(r.toEntity.id);
        queue.push(r.toEntity.id);
      }
    }
  }

  const orphanedDescendantIds = [...subtreeIds].filter(id => id !== entityId && !keptSubtreeIds.has(id));

  const values = getValues({
    selector: value => value.entity.id === entityId && value.spaceId === sourceSpaceId,
  });

  const relationIds = new Set<string>();
  const relations: Relation[] = [];
  const pushRelation = (r: Relation) => {
    if (relationIds.has(r.id)) return;
    relationIds.add(r.id);
    relations.push(r);
  };

  getRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === sourceSpaceId,
  }).forEach(pushRelation);

  for (const id of orphanedDescendantIds) {
    values.push(...getValues({ selector: v => v.entity.id === id && v.spaceId === sourceSpaceId }));
    getRelations({
      selector: r => (r.fromEntity.id === id || r.toEntity.id === id) && r.spaceId === sourceSpaceId,
    }).forEach(pushRelation);
  }

  return { values, relations };
}
