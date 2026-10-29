import type { Mutator } from '~/core/sync/use-mutate';
import { getRelations } from '~/core/sync/use-store';

/**
 * Points backlinks in the source space at where the move put the data.
 *
 * `toSpaceId` says which space holds a relation's target, and without one a link resolves to the
 * space it is stored in. Either way a source-space backlink resolves to the source, which after a
 * move no longer holds the data. Other spaces' backlinks are left alone — a move must not publish
 * edits there.
 */
export function retargetMoveBacklinks(
  entityId: string,
  sourceSpaceId: string,
  targetSpaceId: string,
  storage: Mutator
) {
  getRelations({
    selector: relation =>
      relation.toEntity.id === entityId &&
      relation.spaceId === sourceSpaceId &&
      (relation.toSpaceId ?? relation.spaceId) === sourceSpaceId &&
      relation.fromEntity.id !== entityId,
  }).forEach(relation => {
    storage.relations.update(relation, draft => {
      draft.toSpaceId = targetSpaceId;
    });
  });
}
