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

function aggregateRelations({ triples, versions, edits }: AggregateRelationsArgs) {
  const entitiesReferencedByRelations = versions.flatMap(v => {
    const entities = getEntitiesReferencedByRelations(triples, v.entity_id.toString());
    return entities ?? [];
  });

  return Effect.gen(function* (_) {
    const relationsToWrite: Schema.relations.Insertable[] = [];

    // These are the valid versions that exist in the db already and aren't any new versions
    // that are created in this edit. We don't set versions as "valid" until we process the
    // proposal state, therefore we know that any versions in this edit haven't been set to
    // accepted yet.
    const dbVersionsForEntitiesReferencedByRelations = (yield* _(
      Effect.all(
        entitiesReferencedByRelations.map(entityId => {
          return Effect.promise(() => Versions.findLatestValid(entityId));
        })
      )
    )).flatMap(v => (v ? [v] : []));

    // @TODO: Figure out which relations have been deleted between versions.
    // @TODO: Get relations for the previous versions of entities in this block. Add them to
    // relationsToWrite. Need to handle if there are any relations that are deleted.

    /**
     * We process relations by edit id so that we can use either the latest or any version
     * in the specific edit when referencing to, from, and type within a relation. Otherwise
     * we can have relations referencing versions in different edits which doesn't make sense.
     */

    // For each edit we need to find the latest version for each entity referenced by each
    // relation in the edit. We also need to check if there is a version in this edit that
    // is newer than the latest version in the db.
    for (const edit of edits) {
      const latestVersionsByEntityId = new Map<string, string>();
      const blockVersionsForEdit = versions.filter(v => v.edit_id.toString() === edit.id.toString());

      // Merge the versions from this block for this edit with any versions for this entity
      // from the database. We favor any versions from the block over the versions in the
      // database.
      const allVersionsReferencedByRelations = [...dbVersionsForEntitiesReferencedByRelations, ...blockVersionsForEdit];

      for (const version of allVersionsReferencedByRelations) {
        latestVersionsByEntityId.set(version.entity_id.toString(), version.id.toString());
      }

      const relationsFromEdit = blockVersionsForEdit.flatMap(v => {
        const relationsForEntity = getRelationTriplesFromSchemaTriples(
          triples,
          v.entity_id.toString(),
          latestVersionsByEntityId
        );
        return relationsForEntity ?? [];
      });

      relationsToWrite.push(...relationsFromEdit);
    }

    return relationsToWrite;
  });
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
