import { Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities, Triples, Versions } from '../db';
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

      // @TODO(performance): We probably want to precalculate this instead of doing it blocking in the loop
      const lastVersion = yield* awaited(Effect.promise(() => Versions.findLatestValid(entity.id.toString())));

      if (lastVersion) {
        const lastVersionTriples = yield* awaited(Effect.promise(() => Triples.select({ version_id: lastVersion.id })));

        if (version.entity_id.toString() === '1d5d0c2adb23466ca0b09abe879df457' && lastVersionTriples.length > 0) {
          console.log({
            version,
            lastVersionTriples,
          });
        }

        const editWithCreatedById: SchemaTripleEdit = {
          versonId: version.id.toString(),
          createdById: version.created_by_id.toString(),
          spaceId: version.space_id.toString(),
          ops: lastVersionTriples.map((t): Op => {
            return {
              type: 'SET_TRIPLE',
              triple: {
                entity: t.entity_id,
                attribute: t.attribute_id,
                value: {
                  type: t.value_type,
                  value: (t.value_type === 'ENTITY' ? t.entity_value_id : t.text_value) as string,
                },
              },
            };
          }),
        };

        // Make sure that we put the last version's ops before the new version's
        // ops so that when we squash the ops later they're ordered correctly.
        triples.push(...mapSchemaTriples(editWithCreatedById, block));
      }

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
