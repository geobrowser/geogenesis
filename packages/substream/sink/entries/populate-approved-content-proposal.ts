import { Effect, Either } from 'effect';
import { groupBy } from 'effect/ReadonlyArray';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { Entities } from '../db';
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
    const proposedVersionsByProposal = yield* awaited(
      Effect.all(
        proposals.map(p => {
          return Effect.tryPromise({
            try: () => db.select('proposed_versions', { proposal_id: p.id }).run(pool),
            catch: error => new Error(`Failed to fetch proposed versions. ${(error as Error).message}`),
          });
        })
      )
    );

    // We might get multiple proposals at once in the same block that change the same set of entities.
    // We need to make  sure that we process the proposals in order to avoid conflicts when writing to
    // the DB as well as to make sure we preserve the proposal ordering as they're received from the chain.
    for (const proposedVersions of proposedVersionsByProposal) {
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

      if (entities.some(e => e.id === 'e9b2ca5149f743b7ab1e57f5a65d8009'))
        console.log('proposed version has duplicate block');

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

      // @TODO: Transaction
      yield* awaited(
        Effect.all([
          Effect.tryPromise({
            try: () =>
              // We update the name and description for an entity when mapping
              // through triples.
              Entities.upsert(entities),
            // upsertChunked('entities', entities, 'id', {
            //   updateColumns: ['updated_at', 'updated_at_block', 'created_by_id'],
            //   noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
            // }),
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
          proposalId: pv.proposal_id,
          createdById: pv.created_by_id,
          spaceId: pv.space_id,
          ops: ops.filter(o => o.payload.entityId === pv.entity_id),
        })
      );

      const schemaTriples = opsWithCreatedById.map(o => mapSchemaTriples(o, block)).flat();

      yield* awaited(
        populateTriples({
          schemaTriples: schemaTriples,
          block,
          versions,
        })
      );
    }
  });
}
