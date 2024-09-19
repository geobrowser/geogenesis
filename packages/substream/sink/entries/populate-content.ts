import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities } from '../db';
import { Relations } from '../db/relations';
import { aggregateRelations } from '../events/aggregate-relations';
import { type SchemaTripleEdit, mapSchemaTriples } from '../events/proposal-processed/map-triples';
import { populateTriples } from '../events/proposal-processed/populate-triples';
import type { BlockEvent, Op } from '../types';

interface PopulateContentArgs {
  versions: Schema.versions.Insertable[];
  opsByVersionId: Map<string, Op[]>;
  edits: Schema.edits.Insertable[];
  block: BlockEvent;
  isMerging?: boolean;
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
        ops: opsByVersionId.get(version.id.toString()) ?? [],
      };

      tripleEdits.push(editWithCreatedById);
    }

    const uniqueEntities = dedupeWith(entities, (a, b) => a.id.toString() === b.id.toString());
    const triples = tripleEdits.flatMap(e => mapSchemaTriples(e, block));
    const relations = yield* awaited(aggregateRelations({ triples, versions, edits }));

    if (args.isMerging) {
      console.log('relations', { relations, typeVersion: versions.filter(v => v.entity_id === SYSTEM_IDS.TYPES) });
    }

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
