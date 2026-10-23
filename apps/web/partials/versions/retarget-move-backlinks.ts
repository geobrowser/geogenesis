import { getRelations } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';

/**
 * Backlinks in the source space, pointed at where the move put the data.
 *
 * `toSpaceId` says which space holds a relation's target, and after a move the source space no
 * longer does. Other spaces' backlinks are left alone — a move must not publish edits there.
 */
export function collectBacklinkRetargets(entityId: string, sourceSpaceId: string, targetSpaceId: string): Relation[] {
  return getRelations({
    selector: relation =>
      relation.toEntity.id === entityId &&
      relation.spaceId === sourceSpaceId &&
      relation.toSpaceId === sourceSpaceId &&
      relation.fromEntity.id !== entityId,
  }).map(relation => ({ ...relation, toSpaceId: targetSpaceId }));
}
