import { SYSTEM_IDS, createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import { CurrentVersions, Versions } from '../db';
import { Relations } from '../db/relations';
import type { OpWithCreatedBy } from './map-triples';

interface AggregateRelationsArgs {
  triples: OpWithCreatedBy[];
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
export function aggregateRelations({ triples, versions, edits, editType }: AggregateRelationsArgs) {
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

    // We process relations by edit id so that we can use either the latest or any version
    // in the specific edit when referencing to, from, and type within a relation. Otherwise
    // we can have relations referencing versions in different edits which doesn't make sense.
    //
    // @TODO we can run into a situation during space imports where we have entities referencing
    // an entity that was created in a previous edit. Since imports are all processed in the same
    // block, these entities aren't approved yet, so any logic that looks for previous versions
    // of an entity (like relations) will fail.
    for (const edit of edits) {
      const latestVersionForChangedEntities: Record<string, string> = {};
      const blockVersionsForEdit = versions.filter(v => v.edit_id.toString() === edit.id.toString());

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

      const deletedRelationEntityIds = collectDeletedRelationsEntityIds(
        triples,
        new Set(...latestRelationsFromDbForVersions.map(r => r.entity_id))
      );

      const nonDeletedDbRelations = latestRelationsFromDbForVersions.filter(
        r => !deletedRelationEntityIds.has(r.entity_id)
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
        const relationsForEntity = getRelationFromTriples(
          triples,
          v.entity_id.toString(),
          latestVersionForChangedEntities
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
 *
 * To do this we look up all entity ids for relations in this block. If we
 * encounter a triple in this block that deletes a triple with an attribute id
 * of TYPES _and_ the entity id is for a relation entity, then we know that
 * we're deleting a relation. We only write relations if they have a triple
 * with an entity value type, therefore we know there's only one type triple
 * defined for each relation for each space.
 *
 * @TODO Relations should be scoped to a space, so this deleting step should
 * be space-aware so that we delete the correct relation in the case where
 * a relation entity has multiple triples in multiple spaces.
 */
function collectDeletedRelationsEntityIds(
  schemaTriples: OpWithCreatedBy[],
  entityIdsForDbRelations: Set<string>
): Set<string> {
  const deletedIds = schemaTriples.flatMap(t => {
    if (t.op === 'DELETE_TRIPLE' && t.triple.attribute_id === SYSTEM_IDS.TYPES) {
      const deletedTripleEntityId = t.triple.entity_id.toString();

      if (entityIdsForDbRelations.has(deletedTripleEntityId)) {
        return [deletedTripleEntityId];
      }
    }

    return [];
  });

  return new Set(deletedIds);
}

function getEntitiesReferencedByRelations(schemaTriples: OpWithCreatedBy[], entityId: string): string[] | null {
  // Grab other triples in this edit that match the relation's entity id. We
  // want to add all of the relation properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(t => t.triple.entity_id === entityId && t.op === 'SET_TRIPLE');

  const to = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  const toId = to?.triple.entity_value_id;
  const fromId = from?.triple.entity_value_id;
  const typeId = type?.triple.entity_value_id;

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
function getRelationFromTriples(
  schemaTriples: OpWithCreatedBy[],
  entityId: string,
  latestVersionForChangedEntities: Record<string, string>
): Schema.relations.Insertable | null {
  // Grab other triples in this edit that match the relation's entity id. We
  // want to add all of the relation properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(t => t.triple.entity_id === entityId && t.op === 'SET_TRIPLE');

  const relationIndex = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_INDEX);
  const to = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  const indexValue = relationIndex?.triple.text_value?.toString();
  const toId = to?.triple.entity_value_id?.toString();
  const fromId = from?.triple.entity_value_id?.toString();
  const typeId = type?.triple.entity_value_id?.toString();

  if (!toId || !fromId || !typeId) {
    return null;
  }

  const toVersion = latestVersionForChangedEntities[toId];
  const fromVersion = latestVersionForChangedEntities[fromId];
  const typeVersion = latestVersionForChangedEntities[typeId];

  if (!toVersion || !fromVersion || !typeVersion) {
    return null;
  }

  const relationId = createGeoId(); // Not deterministic

  return {
    id: relationId,
    to_version_id: toVersion,
    from_version_id: fromVersion,
    entity_id: entityId,
    type_of_id: typeVersion,
    index: indexValue,
  };
}
