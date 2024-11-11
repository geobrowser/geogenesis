import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import type { BlockEvent, Op } from '../types';
import { getDeletedRelations, getStaleEntitiesInEdit, maybeEntityOpsToRelation } from './aggregate-relations-v2';
import { makeVersionForStaleEntity } from './make-version-for-stale-entity';

interface AggregateNewVersionsArgs {
  edits: Schema.edits.Insertable[];
  ipfsVersions: Schema.versions.Insertable[];
  opsByEditId: Map<string, Op[]>;
  opsByEntityId: Map<string, Op[]>;
  block: BlockEvent;
}

/**
 *  When aggregating relations there's two steps
 *  1. Gathering relations from previous version of an entity
 *  2. Filtering any relations deleted in the same edit
 *  3. Adding any new relations in the same edit
 *
 * #3 is also used to see if we need to manually create any versions for
 * entities with new relations that don't have created versions.
 */
// Can we parallelize in order? Effect.all
export function aggregateNewVersions(args: AggregateNewVersionsArgs) {
  const { edits, opsByEditId, opsByEntityId, ipfsVersions, block } = args;
  const newVersions = ipfsVersions;

  return Effect.gen(function* (_) {
    // @TODO This needs to be import-aware...
    for (const edit of edits) {
      const versionsInEdit = ipfsVersions.filter(v => v.edit_id.toString() === edit.id);
      const entitiesInEdit = new Set(versionsInEdit.map(v => v.entity_id.toString()));
      const opsInEdit = opsByEditId.get(edit.id.toString()) ?? [];

      const createdRelations = [...opsByEntityId.entries()]
        .filter(([entityId]) => entitiesInEdit.has(entityId))
        .map(([entityId, ops]) => maybeEntityOpsToRelation(ops, entityId))
        .filter(r => r !== null);

      const deletedRelations = yield* _(getDeletedRelations(opsInEdit));

      // Stale entities are entities which are referenced by the "from" field in
      // created or deleted relations where the entity does not have a new version
      // in the edit.
      //
      // e.g., you make a new relation from Entity A, but do not change Entity A
      // itself, therefore a new version for Entity A is not created in this edit.
      const staleEntities = [
        ...new Set(getStaleEntitiesInEdit({ createdRelations, deletedRelations, entityIds: entitiesInEdit })),
      ];
      const versionsForStaleEntities = staleEntities.map(entityId =>
        makeVersionForStaleEntity({
          block,
          createdAt: edit.created_at.toString(),
          creator: edit.created_by_id.toString(),
          editId: edit.id.toString(),
          entityId,
        })
      );

      // Append new versions for stale entities to versions in edit
      newVersions.push(...versionsForStaleEntities);

      console.log('relations', {
        staleEntities,
        deletedRelations,
        versionsForStaleEntities,
        newVersions,
      });

      // Theoretically as soon as we append the new versions we can just let the existing
      //     write flow continue as-is. But it wouldn't be ideal since we're doing a lot
      //     of duplicated work and those db writes aren't contained to a tx'.
      // Map aggregated relations to be version-aware
      // Map aggregated relations to Map<VersionId, Relations[]>
    }

    return newVersions;
  });
}
