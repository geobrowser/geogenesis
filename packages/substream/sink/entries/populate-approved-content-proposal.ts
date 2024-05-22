import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { type SchemaTripleEdit, mapSchemaTriples } from '../events/proposal-processed/map-triples';
import { populateTriples } from '../events/proposal-processed/populate-triples';
import type { BlockEvent, Op } from '../types';
import { upsertChunked } from '../utils/db';
import { createVersionId } from '../utils/id';
import { pool } from '../utils/pool';

export function populateApprovedContentProposal(
  proposals: Schema.proposals.Selectable[],
  // Since we read from IPFS to get the onchain id we also just pass in the actions
  // so we don't have to query the DB. Also so we know we get the correct order
  // of the actions from IPFS.
  ops: Op[],
  block: BlockEvent
) {
  return Effect.gen(function* (awaited) {
    const nestedProposedVersions = yield* awaited(
      Effect.all(
        proposals.map(p => {
          return Effect.tryPromise({
            try: () => db.select('proposed_versions', { proposal_id: p.id }).run(pool),
            catch: error => new Error(`Failed to fetch proposed versions. ${(error as Error).message}`),
          });
        })
      )
    );

    const proposedVersions = nestedProposedVersions.flatMap(pv => pv);

    const entities = proposedVersions.map(pv => {
      const newEntity: Schema.Insertable = {
        id: pv.entity_id,
        created_by_id: pv.created_by_id,
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        updated_at: block.timestamp,
        updated_at_block: block.blockNumber,
      };

      return newEntity;
    });

    const versions = proposedVersions.map(pv => {
      const newVersion: Schema.versions.Insertable = {
        id: createVersionId({
          entityId: pv.entity_id,
          proposalId: pv.proposal_id,
        }),
        entity_id: pv.entity_id,
        created_at_block: block.blockNumber,
        created_at: block.timestamp,
        created_by_id: pv.created_by_id,
        proposed_version_id: pv.id,
        space_id: pv.space_id,
      };

      return newVersion;
    });

    // const tripleVersions = yield* awaited(mapTripleVersions(versions));
    const tripleVersions = [];

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          try: () =>
            // We update the name and description for an entity when mapping
            // through triples.
            upsertChunked('entities', entities, 'id', {
              updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
              noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
            }),
          catch: error => new Error(`Failed to insert bulk entities. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('proposals', proposals, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk proposals. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('versions', versions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk versions. ${(error as Error).message}`),
        }),
        // Effect.tryPromise({
        //   try: () => upsertChunked('triple_versions', tripleVersions, ['triple_id', 'version_id']),
        //   catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
        // }),
      ])
    );

    const opsWithCreatedById = proposedVersions.map(
      (pv): SchemaTripleEdit => ({
        createdById: pv.created_by_id,
        spaceId: pv.space_id,
        ops: ops.filter(o => o.payload.entityId === pv.entity_id),
      })
    );

    const schemaTriples = opsWithCreatedById.map(o => mapSchemaTriples(o, block)).flat();

    yield* awaited(
      populateTriples({
        schemaTriples,
        block,
        versions,
      })
    );
  });
}
