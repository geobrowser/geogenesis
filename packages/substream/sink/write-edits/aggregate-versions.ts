import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import type { BlockEvent, Op } from '../types';
import { makeVersionForStaleEntity } from './make-version-for-stale-entity';
import {
  getStaleEntitiesFromDeletedRelations,
  getStaleEntitiesInEdit,
  maybeEntityOpsToRelation,
} from './relations/get-stale-entities-from-relations';

interface AggregateNewVersionsArgs {
  edits: Schema.edits.Insertable[];
  ipfsVersions: Schema.versions.Insertable[];
  opsByEditId: Map<string, Op[]>;
  opsByEntityId: Map<string, Op[]>;
  block: BlockEvent;
  editType: 'DEFAULT' | 'IMPORT';
}

/**
 * Versions are created when any new ops change the triples for an entity. Additionally,
 * a new Version should be created when a relation _from_ an entity is created or deleted.
 *
 * This function finds any entities that do not already have a version in the current edit,
 * that also has one or more of its relations created or deleted.
 *
 * @TODO does changing a relation also require making a new version for the from entity?
 */
export function aggregateNewVersions(args: AggregateNewVersionsArgs) {
  const { edits, editType, opsByEditId, opsByEntityId, ipfsVersions, block } = args;
  const newVersions = ipfsVersions;

  return Effect.gen(function* (_) {
    for (const edit of edits) {
      // If we're reading a set of imported edits we want to use all of the versions
      // from the set and not just the versions from the current edit. This is because
      // an edit in an import might reference an edit in the import that hasn't been
      // "accepted" yet. We should treat these edits as if they are a single atomic
      // unit that will eventually be accepted.
      const versionsInEdit =
        editType === 'IMPORT' ? ipfsVersions : ipfsVersions.filter(v => v.edit_id.toString() === edit.id);
      const entitiesInEdit = new Set(versionsInEdit.map(v => v.entity_id.toString()));
      const opsInEdit = opsByEditId.get(edit.id.toString()) ?? [];

      const createdRelations = [...opsByEntityId.entries()]
        .filter(([entityId]) => entitiesInEdit.has(entityId))
        .map(([entityId, ops]) => maybeEntityOpsToRelation(ops, entityId))
        .filter(r => r !== null);

      const entitiesFromDeletedRelations = yield* _(getStaleEntitiesFromDeletedRelations(opsInEdit));

      // Stale entities are entities which are referenced by the "from" field in
      // created or deleted relations where the entity does not have a new version
      // in the edit.
      //
      // e.g., you make a new relation from Entity A, but do not change Entity A
      // itself, therefore a new version for Entity A is not created in this edit.
      const staleEntities = [
        ...new Set(
          getStaleEntitiesInEdit({
            createdRelations,
            entitiesFromDeletedRelations,
            entityIds: entitiesInEdit,
          })
        ),
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

      // Theoretically as soon as we append the new versions we can just let the existing
      //     write flow continue as-is. But it wouldn't be ideal since we're doing a lot
      //     of duplicated work and those db writes aren't contained to a tx'.
      // Map aggregated relations to be version-aware
      // Map aggregated relations to Map<VersionId, Relations[]>
    }

    return newVersions;
  });
}
