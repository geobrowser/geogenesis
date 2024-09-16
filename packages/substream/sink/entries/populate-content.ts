import { Effect, Either } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities } from '../db';
import { type SchemaTripleEdit, mapSchemaTriples } from '../events/proposal-processed/map-triples';
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

    const res = yield* awaited(
      Effect.either(
        Effect.all([
          Effect.tryPromise({
            // We update the name and description for an entity when mapping
            // through triples.
            try: () => Entities.upsert(uniqueEntities),
            catch: error => new Error(`Failed to insert entity. ${(error as Error).message}`),
          }),
          populateTriples({
            schemaTriples: tripleEdits.flatMap(e => mapSchemaTriples(e, block)),
            block,
          }),
        ])
      )
    );

    if (Either.isLeft(res)) {
      console.log('populateContent error', res.left);
    }
  });
}
