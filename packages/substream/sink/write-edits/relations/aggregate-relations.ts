import { ID } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import { CurrentVersions } from '~/sink/db';
import { Relations } from '~/sink/db/relations';
import type { CreateRelationOp, DeleteRelationOp } from '~/sink/types';

interface AggregateRelationsArgs {
  relationOpsByEditId: Map<string, (CreateRelationOp | DeleteRelationOp)[]>;
  versions: Schema.versions.Insertable[];
  edits: Schema.edits.Insertable[];
  editType: 'IMPORT' | 'DEFAULT';
}

/**
 * Aggregate all relations for any new versions in this block. Relations point
 * to versions for the type, from, and to entities. This means we need to collect
 * the latest versions for each entity referenced by a relation.
 *
 * The latest version references for a relation may also be created in the edit
 * where the relation was created.
 *
 * There's a lot of work needed to collect all of the relations to write for a
 * given new version.
 * 1. Collect all of the entity ids referenced by all new relations in this block
 * 2. Get the last valid version for each entity id referenced in this block, e.g.,
 *    ids for entities referenced in relations or in new versions
 * 3. For each edit (to ensure we are referencing new versions from the correct edit)
 *    a. Select the last version either from the db or from the edit for each entity id
 *    b. Get all of the db relations for each last valid version in this edit
 *    c. Get which of the db relations are being deleted in this edit
 *    d. Filter out any of the db relations that are being deleted
 *    e. Map the still-valid db relations to any new versions in this edit
 *    f. Map new relations in this edit using the new triples and the latest versions
 *       for each entity id
 * 4. Return all of the relations to write
 *
 * @NOTE: This level of complexity is mostly only necessary because we are pointing
 * relations to specific versions instead of just the entity id. The benefit of this
 * is that we can read a relation at any point in time and know that it's pointing to
 * the correct version at the same point in time. Otherwise we would need to traverse
 * the versions for each entity in a relation and find the correct version for the
 * relation at the time the relation was created.
 *
 * @params versions - The versions that have been created in this block as array of {@link Schema.versions.Insertable}
 * @params edits - The edits that have been created in this block as array of {@link Schema.edits.Insertable}
 * @params triples - The triples that have been created in this block as array of {@link OpWithCreatedBy}
 * @returns relations – The relations to write as array of {@link Schema.relations.Insertable}
 */
export function aggregateRelations({ relationOpsByEditId, versions, edits, editType }: AggregateRelationsArgs) {
  const relationOps = [...relationOpsByEditId.values()].flat();

  const entitiesReferencedByNewRelations = [...new Set(getEntitiesReferencedByNewRelations(relationOps))];

  return Effect.gen(function* (_) {
    const relationsToWrite: Schema.relations.Insertable[] = [];

    const referencedEntitiesInBlock = [
      ...new Set([...versions.map(v => v.entity_id.toString()), ...entitiesReferencedByNewRelations]),
    ];

    const dbVersionsForEntitiesReferencedInBlock = (yield* _(
      Effect.forEach(
        referencedEntitiesInBlock,
        entityId => {
          return Effect.retry(
            Effect.promise(() => CurrentVersions.selectOne({ entity_id: entityId })),
            { times: 5 }
          );
        },
        {
          concurrency: 50,
        }
      )
    )).filter(v => !!v);

    const lastDbVersionByEntityId = dbVersionsForEntitiesReferencedInBlock.reduce((acc, v) => {
      acc.set(v.entity_id.toString(), v.version_id.toString());
      return acc;
    }, new Map<string, string>());

    // For all of the referenced versions, both from the edit and from the past, we
    // need to fetch the relations for each version so we can merge into new versions.
    const latestRelationsFromDbForVersions = (yield* _(
      Effect.forEach(
        [...lastDbVersionByEntityId.values()],
        version => Effect.promise(() => Relations.select({ from_version_id: version })),
        {
          concurrency: 100,
        }
      )
    ))
      // flattest of flattenings
      .filter(v => Boolean(v))
      .flat();

    const deletedRelations = collectDeletedRelationIds(relationOpsByEditId);

    // We process relations by edit id so that we can use either the latest or any version
    // in the specific edit when referencing to, from, and type within a relation. Otherwise
    // we can have relations referencing versions in different edits which doesn't make sense.
    for (const edit of edits) {
      const editId = edit.id.toString();
      const latestVersionForChangedEntities: Record<string, string> = {};
      const blockVersionsForEdit = versions.filter(v => v.edit_id.toString() === editId);

      // @TODO: We're already calculating deleted ops by edit in the aggregateNewVersions
      // function in order to find any stale entity versions. We can probably merge the
      // work we're doing there with the work we're doing here somehow.
      const deletedRelationsForEdit = new Set(deletedRelations.get(edit.id.toString()) ?? []);

      // Merge the versions from this block for this edit with any versions for this entity
      // from the database. We favor any versions from the block over the versions in the
      // database.
      const allVersionsReferencedByRelations = [
        ...dbVersionsForEntitiesReferencedInBlock.map(cv => {
          return {
            id: cv.version_id,
            entity_id: cv.entity_id,
          };
        }),

        // If we're reading a set of imported edits we want to use all of the versions
        // from the set and not just the versions from the current edit. This is because
        // an edit in an import might reference an edit in the import that hasn't been
        // "accepted" yet. We should treat these edits as if they are a single atomic
        // unit that will eventually be accepted.
        ...(editType === 'IMPORT' ? versions : blockVersionsForEdit),
      ];

      // Iterates over all of the versions referenced by new relations in this block and
      // map them to their entity id. We overwrite the db version with the edit version
      // if it exists, e.g., there's a new version in this edit for the same entity id.
      for (const version of allVersionsReferencedByRelations) {
        latestVersionForChangedEntities[version.entity_id.toString()] = version.id.toString();
      }

      const nonDeletedDbRelations = latestRelationsFromDbForVersions.filter(
        latestRelation => !deletedRelationsForEdit.has(latestRelation.entity_id.toString())
      );

      const relationsFromDbToWrite = blockVersionsForEdit.flatMap(v => {
        const lastDbVersionForEntityId = lastDbVersionByEntityId.get(v.entity_id.toString());

        if (!lastDbVersionForEntityId) {
          return [];
        }

        const nonDeletedRelationsFromPreviousVersion = nonDeletedDbRelations.filter(
          v => v.from_version_id === lastDbVersionForEntityId
        );

        const relationsForEntity = nonDeletedRelationsFromPreviousVersion
          .map((r): Schema.relations.Insertable | null => {
            // If the version for the to or type entity is not found, then we know there's not a new
            // version for it in this edit, so we can use the existing version id.
            const type_version_id = latestVersionForChangedEntities[r.type_of_id] ?? r.type_of_version_id;
            const to_version_id = latestVersionForChangedEntities[r.to_entity_id] ?? r.to_version_id;

            return {
              id: ID.make(), // Not deterministic
              // We look up the latest version for both the type and to versions
              // using their entity ids so they're updated before writing to the
              // db. The latest version can come from the db or come from the
              // current edit.
              //
              // If the type_of or to_version aren't changed in this edit then we
              // can fall back to the last version.
              space_id: r.space_id,

              type_of_id: r.type_of_id,
              to_entity_id: r.to_entity_id,
              from_entity_id: r.from_entity_id,

              type_of_version_id: type_version_id,
              to_version_id: to_version_id,
              from_version_id: v.id,
              index: r.index,
              entity_id: r.entity_id,
            };
          })
          .filter(r => r !== null);

        return relationsForEntity;
      });

      const newRelationsForEdit = (relationOpsByEditId.get(editId) ?? []).filter(r => r.type === 'CREATE_RELATION');

      const relationsFromEdit = newRelationsForEdit
        .map((r): Schema.relations.Insertable | null => {
          const type_version_id = latestVersionForChangedEntities[r.relation.type];
          const to_version_id = latestVersionForChangedEntities[r.relation.toEntity];
          const from_version_id = latestVersionForChangedEntities[r.relation.fromEntity];

          if (!type_version_id || !to_version_id || !from_version_id) {
            return null;
          }

          return {
            id: ID.make(), // Not deterministic
            // We look up the latest version for both the type and to versions
            // using their entity ids so they're updated before writing to the
            // db. The latest version can come from the db or come from the
            // current edit.
            //
            // If the type_of or to_version aren't changed in this edit then we
            // can fall back to the last version.
            space_id: r.space,

            type_of_id: r.relation.type,
            to_entity_id: r.relation.toEntity,
            from_entity_id: r.relation.fromEntity,

            type_of_version_id: type_version_id,
            to_version_id: to_version_id,
            from_version_id: from_version_id,
            index: r.relation.index,
            entity_id: r.relation.id,
          };
        })
        .filter(r => r !== null);

      relationsToWrite.push(...relationsFromDbToWrite);
      relationsToWrite.push(...relationsFromEdit);
    }

    return relationsToWrite;
  });
}

/**
 * Check if any of the triples in the block are deleting a relation. Right now
 * we don't store the value for deleted ops on IPFS, so we have to rely on a
 * heuristic + lookup to know if the triple we're deleting is for an entity
 * defined as a relation.
 */
function collectDeletedRelationIds(opsByEditId: Map<string, (DeleteRelationOp | CreateRelationOp)[]>) {
  // edit id -> relation id[]
  const deletedRelationIdsByEditId = new Map<string, string[]>();

  for (const [editId, ops] of opsByEditId.entries()) {
    const deleteOps = ops.filter(o => o.type === 'DELETE_RELATION');

    deletedRelationIdsByEditId.set(
      editId,
      deleteOps.map(o => o.relation.id)
    );
  }

  return deletedRelationIdsByEditId;
}

function getEntitiesReferencedByNewRelations(relationOps: (CreateRelationOp | DeleteRelationOp)[]): string[] {
  return relationOps
    .filter(r => r.type === 'CREATE_RELATION')
    .flatMap(r => [r.relation.toEntity, r.relation.fromEntity, r.relation.type]);
}
