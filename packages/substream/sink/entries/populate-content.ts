import { SYSTEM_IDS, createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities, Versions } from '../db';
import { Relations } from '../db/relations';
import {
  type OpWithCreatedBy,
  type SchemaTripleEdit,
  mapSchemaTriples,
} from '../events/proposal-processed/map-triples';
import { populateTriples } from '../events/proposal-processed/populate-triples';
import type { BlockEvent, Op } from '../types';

interface PopulateContentArgs {
  versions: Schema.versions.Insertable[];
  opsByVersionId: Map<string, Op[]>;
  edits: Schema.edits.Insertable[];
  block: BlockEvent;
}

export function populateContent(args: PopulateContentArgs) {
  const { versions, opsByVersionId, edits, block } = args;
  const spaceIdByEditId = new Map<string, string>();

  for (const edit of edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  return Effect.gen(function* (awaited) {
    const entities: Schema.entities.Insertable[] = [];
    const tripleEdits: SchemaTripleEdit[] = [];

    // We might get multiple proposals at once in the same block that change the same set of entities.
    // We need to make sure that we process the proposals in order to avoid conflicts when writing to
    // the DB as well as to make sure we preserve the proposal ordering as they're received from the chain.
    for (const version of versions) {
      const entity: Schema.entities.Insertable = {
        id: version.entity_id,
        created_by_id: version.created_by_id,
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        updated_at: block.timestamp,
        updated_at_block: block.blockNumber,
      };

      entities.push(entity);

      const editWithCreatedById: SchemaTripleEdit = {
        versonId: version.id.toString(),
        createdById: version.created_by_id.toString(),
        spaceId: spaceIdByEditId.get(version.edit_id.toString())!,
        ops: opsByVersionId.get(version.id.toString())!,
      };

      tripleEdits.push(editWithCreatedById);
    }

    const uniqueEntities = dedupeWith(entities, (a, b) => a.id.toString() === b.id.toString());
    const triples = tripleEdits.flatMap(e => mapSchemaTriples(e, block));
    const relations = yield* awaited(aggregateRelations({ triples, versions, edits }));

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          // We update the name and description for an entity when mapping
          // through triples.
          try: () => Entities.upsert(uniqueEntities),
          catch: error => new Error(`Failed to insert entities. ${(error as Error).message}`),
        }),
        populateTriples({
          schemaTriples: triples,
          block,
        }),
        Effect.tryPromise({
          try: () => Relations.upsert(relations, { chunked: true }),
          catch: error => new Error(`Failed to insert relations. ${(error as Error).message}`),
        }),
      ])
    );

    /**
     * @TODO: Get relations so we can map relations and other dependent types
     *
     * -- we add the types and spaces, etc., on the version and not the entity --
     *
     * Everything related to _data_ is mapped to Versions and not Entities. This is so we have a unified
     * interface for interacting with an entity at a given point in time. This means that when we add
     * triples, we're adding them to a specific _version_ of an entity. When we add relations we need to
     * do the same thing.
     *
     * Relations are a bit more complex in that they reference _four_ entities, and not just one. We need
     * to update these four entity references to now point to versions instead of entities.
     *
     * 1. ~~Id of the relation row should point to a version~~ don't think this is necessary. It can just
     *    be an entity id.
     * 2. The from and to entity ids should point to versions
     * 3. The type of the relation should point to a version
     *
     * To add more complexity, the versions they point to might be getting changed within this block, so
     * we'll need to keep that in sync. Lastly the _relation itself_ might be getting changed as well.
     * Lots to keep in sync.
     *
     * Algorithm
     * 1. See if there are any from, to, or type entities that have new versions in this block. Write these
     *    to a map if so. We'll use this map later when writing relations.
     * 2. If there are from, to, or type entities that are _not_ in the block, then we need to fetch their
     *    latest versions and write them to the mapping.
     *
     * @TODO:
     * 1. Merge relations from previous versions
     * 2. Merge relations from committed squashed versions
     *
     * Q:
     * * How do we merge previous relations into new versions? Need to check for relation deletions
     * * How do we update "approved" relations to point to the latest version and not the version at
     *   the time of creation in the case that we commit a new version?
     */

    // --- These should probably be done after processing the proposals vs now ---
    // @TODO: space
    // @TODO: types
  });
}

interface AggregateRelationsArgs {
  triples: OpWithCreatedBy[];
  versions: Schema.versions.Insertable[];
  edits: Schema.edits.Insertable[];
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
 * 2. Get the last valid version for each entity id referenced by new relations
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
 * is that we can read a relation at any point and time and know that it's pointing to
 * the correct version at the same point in time. Otherwise we would need to traverse
 * the versions for each entity in a relation and find the correct version for the
 * relation at the time the relation was created.
 *
 * @params versions - The versions that have been created in this block as array of {@link Schema.versions.Insertable}
 * @params edits - The edits that have been created in this block as array of {@link Schema.edits.Insertable}
 * @params triples - The triples that have been created in this block as array of {@link OpWithCreatedBy}
 * @returns relations – The relations to write as array of {@link Schema.relations.Insertable}
 */
function aggregateRelations({ triples, versions, edits }: AggregateRelationsArgs) {
  const entitiesReferencedByNewRelations = versions.flatMap(v => {
    const entities = getEntitiesReferencedByRelations(triples, v.entity_id.toString());
    return entities ?? [];
  });

  return Effect.gen(function* (_) {
    const relationsToWrite: Schema.relations.Insertable[] = [];

    // These are the valid versions that exist in the db already and aren't any new versions
    // that are created in this edit. We don't set versions as "valid" until we process the
    // proposal state, therefore we know that any versions in this edit haven't been set to
    // accepted yet.
    const dbVersionsForEntitiesReferencedByNewRelations = (yield* _(
      Effect.all(
        entitiesReferencedByNewRelations.map(entityId => {
          return Effect.promise(() => Versions.findLatestValid(entityId));
        })
      )
    )).flatMap(v => (v ? [v] : []));

    const lastDbVersionForEntitiesReferencedByNewRelations = dbVersionsForEntitiesReferencedByNewRelations.reduce(
      (acc, v) => {
        acc.set(v.entity_id.toString(), v.id.toString());
        return acc;
      },
      new Map<string, string>()
    );

    // We process relations by edit id so that we can use either the latest or any version
    // in the specific edit when referencing to, from, and type within a relation. Otherwise
    // we can have relations referencing versions in different edits which doesn't make sense.
    for (const edit of edits) {
      const latestVersionForChangedEntities = new Map<string, string>();
      const blockVersionsForEdit = versions.filter(v => v.edit_id.toString() === edit.id.toString());

      // Merge the versions from this block for this edit with any versions for this entity
      // from the database. We favor any versions from the block over the versions in the
      // database.
      const allVersionsReferencedByRelations = [
        ...dbVersionsForEntitiesReferencedByNewRelations,
        ...blockVersionsForEdit,
      ];

      // Iterates over all of the versions referenced by new relations in this block and
      // map them to their entity id. We overwrite the db version with the edit version
      // if it exists, e.g., there's a new version in this edit for the same entity id.
      for (const version of allVersionsReferencedByRelations) {
        latestVersionForChangedEntities.set(version.entity_id.toString(), version.id.toString());
      }

      // For all of the referenced versions, both from the edit and from the past, we
      // need to fetch the relations for each version so we can merge into new versions.
      // @TODO: We can do this before the edit loop
      const latestRelationsFromDbForVersions = (yield* _(
        Effect.all(
          [...latestVersionForChangedEntities.values()].map(version => {
            return Effect.promise(() => Relations.select({ from_version_id: version }));
          })
        )
      )).flatMap(r => (r ? [r] : []));

      for (const relation of latestRelationsFromDbForVersions) {
        latestVersionForChangedEntities.set(relation.to_version_id, relation.from_version_id);
      }

      const deletedRelationEntityIds = collectDeletedRelationsEntityIds(
        triples,
        new Set(...latestRelationsFromDbForVersions.map(r => r.entity_id))
      );
      const nonDeletedDbRelations = latestRelationsFromDbForVersions.filter(
        r => !deletedRelationEntityIds.has(r.entity_id)
      );

      const relationsFromDbToWrite = blockVersionsForEdit.flatMap(v => {
        const lastVersionForEntityId = lastDbVersionForEntitiesReferencedByNewRelations.get(v.entity_id.toString());

        if (!lastVersionForEntityId) {
          return [];
        }

        const relationsForEntity = nonDeletedDbRelations
          .filter(v => v.from_version_id === lastVersionForEntityId)
          .map((r): Schema.relations.Insertable => {
            return {
              id: createGeoId(), // Not deterministic
              // We look up the latest version for both the type and to versions
              // so they're updated before writing to the db. The latest version
              // can come from the db or come from the current edit.
              //
              // If the type_of or to_version aren't changed in this edit then we
              // can fall back to the last version.
              type_of_id: latestVersionForChangedEntities.get(r.type_of_id) ?? r.type_of_id,
              to_version_id: latestVersionForChangedEntities.get(r.to_version_id) ?? r.to_version_id,
              from_version_id: v.id,
              index: r.index,
              entity_id: r.entity_id,
            };
          });

        if (v.entity_id === SYSTEM_IDS.SPACE_CONFIGURATION) {
          console.log('space config relations from db', relationsForEntity);
        }

        return relationsForEntity;
      });

      const relationsFromEdit = blockVersionsForEdit.flatMap(v => {
        const relationsForEntity = getRelationTriplesFromSchemaTriples(
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
 * heuristic + lookup to know if the triple we're deleting if for an entity
 * defined as a relation.
 *
 * To do this we look up all entity ids for relations in this block. If we
 * encounter a triple in this block that deletes a triple with an attribute id
 * of TYPES _and_ the entity id is for a relation entity, then we know that
 * we're deleting a relation.
 *
 * @TODO: Relations should be scoped to a space, so this deleting step should
 * be space-aware so that we delete the correct relation in the case where
 * a relation entity has multiple triples in multiple spacs.
 */
function collectDeletedRelationsEntityIds(
  schemaTriples: OpWithCreatedBy[],
  entityIdsForDbRelations: Set<string>
): Set<string> {
  const deletedIds = schemaTriples.flatMap(t => {
    // The problem is that we don't actually know what the value of the deleted
    // type is. We mock it in get-triple-from-op, but the actual IPFS op doesn't
    // contain the value of the op.
    //
    // Should we have a CREATE_RELATION and a DELETE_RELATION op type?
    //
    // Alternatively we can look up the relations and see if it's a delete or not
    // specifically for a relation entity id.
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
  // Grab other triples in this edit that match the collection item's entity id. We
  // want to add all of the collection item properties to the item in the
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
 * Handle creating the database representation of a collection item when a new collection item
 * is created. We need to gather all of the required triples to fully flesh out the collection
 * item's data. We could do this linearly, but we want to ensure that all of the properties
 * exist before creating the item. If not all properties exist we don't create the collection
 * item.
 */
function getRelationTriplesFromSchemaTriples(
  schemaTriples: OpWithCreatedBy[],
  entityId: string,
  latestVersionsByEntityId: Map<string, string>
): Schema.relations.Insertable | null {
  // Grab other triples in this edit that match the collection item's entity id. We
  // want to add all of the collection item properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(t => t.triple.entity_id === entityId && t.op === 'SET_TRIPLE');

  const collectionItemIndex = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_INDEX);
  const to = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  const indexValue = collectionItemIndex?.triple.text_value;
  const toId = to?.triple.entity_value_id;
  const fromId = from?.triple.entity_value_id;
  const typeId = type?.triple.entity_value_id;

  if (!indexValue || !toId || !fromId || !typeId) {
    return null;
  }

  const toVersion = latestVersionsByEntityId.get(toId.toString());
  const fromVersion = latestVersionsByEntityId.get(fromId.toString());
  const typeVersion = latestVersionsByEntityId.get(typeId.toString());

  if (!toVersion || !fromVersion || !typeVersion) {
    return null;
  }

  return {
    id: createGeoId(), // Not deterministic
    to_version_id: toId.toString(),
    from_version_id: fromId.toString(),
    entity_id: entityId,
    type_of_id: typeId.toString(),
    index: indexValue,
  };
}
