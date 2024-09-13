import { Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities } from '../db';
import {
  type OpWithCreatedBy,
  type SchemaTripleEdit,
  mapSchemaTriples,
} from '../events/proposal-processed/map-triples';
import { populateTriples } from '../events/proposal-processed/populate-triples';
import type { BlockEvent, Op } from '../types';

export function populateContent(
  versions: Schema.versions.Insertable[],
  opsByVersionId: Map<string, Op[]>,
  block: BlockEvent
) {
  return Effect.gen(function* (awaited) {
    const entities: Schema.entities.Insertable[] = [];
    const triples: OpWithCreatedBy[] = [];

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
        spaceId: version.space_id.toString(),
        ops: opsByVersionId.get(version.id.toString())!,
      };

      triples.push(...mapSchemaTriples(editWithCreatedById, block));
    }

    const uniqueEntities = dedupeWith(entities, (a, b) => a.id.toString() === b.id.toString());

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          // We update the name and description for an entity when mapping
          // through triples.
          try: () => Entities.upsert(uniqueEntities),
          catch: error => new Error(`Failed to insert entity. ${(error as Error).message}`),
        }),
        populateTriples({
          schemaTriples: triples,
          block,
        }),
      ])
    );
  });
}
