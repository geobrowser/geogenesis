import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { getRelations, getValues } from '~/core/sync/use-store';
import type { Relation, Value } from '~/core/types';

import { collectSubtree } from './clone-entity-into-space';

/**
 * What to delete in the source space after a move's clone lands in the destination.
 *
 * Only this entity's own data in the source space — not backlinks (the id still exists), and not
 * the same values/relations in other spaces.
 */
export function collectMoveDeletions(
  entityId: string,
  sourceSpaceId: string
): { values: Value[]; relations: Relation[] } {
  const { entityIds: subtreeIds } = collectSubtree(entityId, sourceSpaceId);

  const containmentRelationIds = new Set(
    getRelations({
      selector: r =>
        subtreeIds.has(r.fromEntity.id) &&
        r.spaceId === sourceSpaceId &&
        (r.type.id === SystemIds.BLOCKS || r.type.id === SystemIds.TABS_PROPERTY),
    }).map(r => r.id)
  );

  const orphanedDescendantIds = [...subtreeIds].filter(id => {
    if (id === entityId) return false;
    const externalRefs = getRelations({
      selector: r => r.toEntity.id === id && !containmentRelationIds.has(r.id),
    });
    return externalRefs.length === 0;
  });

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
