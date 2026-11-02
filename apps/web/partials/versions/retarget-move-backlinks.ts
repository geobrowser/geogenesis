import type { Mutator } from '~/core/sync/use-mutate';
import { getRelations } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';

import { SCHEMA_RELATION_TYPE_IDS } from './clone-entity-into-space';

/**
 * Points backlinks in the source space at where the move put the data.
 *
 * `toSpaceId` says which space holds a relation's target, and without one a link resolves to the
 * space it is stored in. Either way a source-space backlink resolves to the source, which after a
 * move no longer holds the data. Other spaces' backlinks are left alone — a move must not publish
 * edits there.
 *
 * Schema relations are the exception: without a `toSpaceId` they mean the type's own top space, not
 * the space they are stored in, so pinning them to the destination would hide the type's properties.
 */
export function retargetMoveBacklinks(
  entityId: string,
  sourceSpaceId: string,
  targetSpaceId: string,
  storage: Mutator,
  backlinks: Relation[] = []
) {
  getRelations({
    mergeWith: backlinks,
    selector: relation =>
      relation.toEntity.id === entityId &&
      relation.spaceId === sourceSpaceId &&
      (relation.toSpaceId != null
        ? relation.toSpaceId === sourceSpaceId
        : !SCHEMA_RELATION_TYPE_IDS.has(relation.type.id)) &&
      relation.fromEntity.id !== entityId,
  }).forEach(relation => {
    storage.relations.update(relation, draft => {
      draft.toSpaceId = targetSpaceId;
    });
  });
}
