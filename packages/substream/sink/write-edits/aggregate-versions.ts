import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import type { BlockEvent, Op } from '../types';
import { makeVersionForStaleEntity } from './make-version-for-stale-entity';
import {
  getStaleEntitiesFromDeletedRelations,
  getStaleEntitiesInEdit,
} from './relations/get-stale-entities-from-relations';

interface AggregateNewVersionsArgs {
  edits: Schema.edits.Insertable[];
  ipfsVersions: Schema.versions.Insertable[];
  tripleOpsByEditId: Map<string, Op[]>;
  tripleOpsByEntityId: Map<string, Op[]>;
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
  const { edits, editType, tripleOpsByEditId, tripleOpsByEntityId, ipfsVersions, block } = args;
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
      const opsInEdit = tripleOpsByEditId.get(edit.id.toString()) ?? [];

      const createdRelations = [...tripleOpsByEntityId.entries()]
        .filter(([entityId]) => entitiesInEdit.has(entityId))
        .flatMap(([, ops]) => ops.filter(o => o.type === 'CREATE_RELATION'));

      const entitiesFromDeletedRelations = yield* _(
        getStaleEntitiesFromDeletedRelations(opsInEdit.filter(o => o.type === 'DELETE_RELATION'))
      );

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
    }

    return newVersions;
  });
}
