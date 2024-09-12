import { Effect, Either } from 'effect';
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
    const triplesToWrite: OpWithCreatedBy[] = [];
    const entitiesToWrite: Schema.entities.Insertable[] = [];

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

      entitiesToWrite.push(entity);

      // const tripleVersions = yield* awaited(mapTripleVersions(versions));
      const tripleVersions = [];

      /**
       * We need to map each set of ops with the proposal/proposed version that contains
       * the ops.
       *
       * An entity might change in multiple proposals that are executed within the same block.
       * The current implementation groups _all_ ops across _all_ proposals/proposedVersions
       * for a given entity, so we could write the same ops multiple times if there are multiple
       * proposedVersions that change the same entity.
       */
      const editWithCreatedById: SchemaTripleEdit = {
        proposalId: version.proposal_id.toString(),
        createdById: version.created_by_id.toString(),
        spaceId: version.space_id.toString(),
        ops: opsByVersionId.get(version.id.toString())!,
      };

      // @TODO: Filter out invalid invalid individual triples. We want to filter the triples
      // out instead of just erroring during write since there may be some triples that are
      // required in order to write a higher-order data structure to a database table, e.g.,
      // Relations. If we don't filter then it will look like we have all the valid data for
      // one of the data structures when we actually don't.
      triplesToWrite.push(...mapSchemaTriples(editWithCreatedById, block));
    }

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          // We update the name and description for an entity when mapping
          // through triples.
          try: () => Entities.upsert(entitiesToWrite),
          catch: error => new Error(`Failed to insert entity. ${(error as Error).message}`),
        }),
        populateTriples({
          schemaTriples: triplesToWrite,
          block,
          versions: versions,
        }),
      ])
    );
  });
}
