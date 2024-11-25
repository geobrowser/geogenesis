import { GraphUrl, SYSTEM_IDS, createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import { getDeletedRelationsFromOps } from './get-deleted-relations-from-ops';
import { CurrentVersions } from '~/sink/db';
import { Relations } from '~/sink/db/relations';
import type { Op, SetTripleOp } from '~/sink/types';

interface AggregateRelationsArgs {
  opsByEditId: Map<string, Op[]>;
  spaceIdByEditId: Map<string, string>;
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
export function aggregateRelations({
  opsByEditId,
  versions,
  edits,
  editType,
  spaceIdByEditId,
}: AggregateRelationsArgs) {
  const triples = [...opsByEditId.values()].flat();

  const entitiesReferencedByNewRelations = [
    ...new Set(
      versions.flatMap(v => {
        const entities = getEntitiesReferencedByRelations(triples, v.entity_id.toString());
        return entities ?? [];
      })
    ),
  ];

  return Effect.gen(function* (_) {
    const relationsToWrite: Schema.relations.Insertable[] = [];

    const referencedEntitiesInBlock = [
      ...new Set([...versions.map(v => v.entity_id.toString()), ...entitiesReferencedByNewRelations]),
    ];

    const dbVersionsForEntitiesReferencedInBlock = (yield* _(
      Effect.all(
        referencedEntitiesInBlock.map(entityId => {
          return Effect.retry(
            Effect.promise(() => CurrentVersions.selectOne({ entity_id: entityId })),
            { times: 5 }
          );
        }),
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
      Effect.all(
        [...lastDbVersionByEntityId.values()].map(version => {
          return Effect.promise(() => Relations.select({ from_version_id: version }));
        }),
        {
          concurrency: 100,
        }
      )
    ))
      // flattest of flattenings
      .filter(v => Boolean(v))
      .flat();

    const deletedRelations = yield* _(collectDeletedRelationIds(opsByEditId));

    // We process relations by edit id so that we can use either the latest or any version
    // in the specific edit when referencing to, from, and type within a relation. Otherwise
    // we can have relations referencing versions in different edits which doesn't make sense.
    for (const edit of edits) {
      const editId = edit.id.toString();
      const spaceId = spaceIdByEditId.get(editId)!;
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
        latestRelation => !deletedRelationsForEdit.has(latestRelation.id.toString())
      );

      const relationsFromDbToWrite = blockVersionsForEdit.flatMap(v => {
        const lastDbVersionForEntityId = lastDbVersionByEntityId.get(v.entity_id.toString());

        if (!lastDbVersionForEntityId) {
          return [];
        }

        const nonDeletedRelationsFromPreviousVersion = nonDeletedDbRelations.filter(
          v => v.from_version_id === lastDbVersionForEntityId
        );

        const relationsForEntity = nonDeletedRelationsFromPreviousVersion.map((r): Schema.relations.Insertable => {
          return {
            id: createGeoId(), // Not deterministic
            // We look up the latest version for both the type and to versions
            // using their entity ids so they're updated before writing to the
            // db. The latest version can come from the db or come from the
            // current edit.
            //
            // If the type_of or to_version aren't changed in this edit then we
            // can fall back to the last version.
            space_id: r.space_id,
            type_of_id: r.type_of?.entity_id
              ? latestVersionForChangedEntities[r.type_of.entity_id] ?? r.type_of_id
              : r.type_of_id,
            to_version_id: r.to_entity?.entity_id
              ? latestVersionForChangedEntities[r.to_entity.entity_id] ?? r.to_version_id
              : r.to_version_id,

            from_version_id: v.id,
            index: r.index,
            entity_id: r.entity_id,
          };
        });

        return relationsForEntity;
      });

      const relationsFromEdit = blockVersionsForEdit.flatMap(v => {
        const relationsForEntity = getRelationFromOps(
          triples,
          v.entity_id.toString(),
          latestVersionForChangedEntities,
          spaceId
        );

        return relationsForEntity ?? [];
      });

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
function collectDeletedRelationIds(opsByEditId: Map<string, Op[]>) {
  return Effect.gen(function* (_) {
    // edit id -> relation id[]
    const deletedRelationIdsByEditId = new Map<string, string[]>();

    for (const [editId, ops] of opsByEditId.entries()) {
      // DELETE_TRIPLE ops don't store the value of the deleted op, so we have no way
      // of knowing if the op being deleted here is actually a relation unless we query
      // the Relations table with the entity id.
      const deletedRelations = yield* _(
        getDeletedRelationsFromOps(
          ops.map(t => {
            return {
              attribute: t.triple.attribute,
              entity: t.triple.entity,
              opType: t.type,
            };
          })
        )
      );

      deletedRelationIdsByEditId.set(
        editId,
        deletedRelations.map(r => r.id.toString())
      );
    }

    return deletedRelationIdsByEditId;
  });
}

function getEntitiesReferencedByRelations(schemaTriples: Op[], entityId: string): string[] | null {
  // Grab other triples in this edit that match the relation's entity id. We
  // want to add all of the relation properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(
    t => t.triple.entity === entityId && t.type === 'SET_TRIPLE'
  ) as SetTripleOp[];

  const to = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  const toId = to?.triple.value.value ? GraphUrl.toEntityId(to.triple.value.value) : null;
  const fromId = from?.triple.value.value ? GraphUrl.toEntityId(from.triple.value.value) : null;
  const typeId = type?.triple.value.value ? GraphUrl.toEntityId(type.triple.value.value) : null;

  if (!toId || !fromId || !typeId) {
    return null;
  }

  return [toId.toString(), fromId.toString(), typeId.toString()];
}

/**
 * Handle creating the database representation of a relation when a new relation
 * is created. We need to gather all of the required triples to fully flesh out the collection
 * item's data. We could do this linearly, but we want to ensure that all of the properties
 * exist before creating the item. If not all properties exist we don't create the collection
 * item.
 */
function getRelationFromOps(
  ops: Op[],
  entityId: string,
  latestVersionForChangedEntities: Record<string, string>,
  spaceId: string
): Schema.relations.Insertable | null {
  // Grab other triples in this edit that match the relation's entity id. We
  // want to add all of the relation properties to the item in the
  // collection_items table.
  const otherTriples = ops.filter(t => t.triple.entity === entityId && t.type === 'SET_TRIPLE') as SetTripleOp[];

  const isRelation = otherTriples.find(
    t =>
      t.triple.attribute === SYSTEM_IDS.TYPES &&
      t.triple.value.type === 'URI' &&
      GraphUrl.toEntityId(t.triple.value.value) === SYSTEM_IDS.RELATION_TYPE
  );
  const relationIndex = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_INDEX);
  const to = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  if (!isRelation || !from || !to || !type) {
    return null;
  }

  const indexValue = relationIndex?.triple.value.value ?? null;
  const toId = to ? GraphUrl.toEntityId(to.triple.value.value) : null;
  const fromId = from ? GraphUrl.toEntityId(from.triple.value.value) : null;
  const typeId = type ? GraphUrl.toEntityId(type.triple.value.value) : null;

  if (!toId || !fromId || !typeId) {
    return null;
  }

  const toVersion = latestVersionForChangedEntities[toId];
  const fromVersion = latestVersionForChangedEntities[fromId];
  const typeVersion = latestVersionForChangedEntities[typeId];

  if (!toVersion || !fromVersion || !typeVersion) {
    return null;
  }

  return {
    id: createGeoId(),
    space_id: spaceId,
    to_version_id: toVersion,
    from_version_id: fromVersion,
    entity_id: entityId,
    type_of_id: typeVersion,
    index: indexValue,
  };
}
