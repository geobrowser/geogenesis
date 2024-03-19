import { createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { upsertChunked } from '../utils/db';
import { pool } from '../utils/pool';
import { mapTripleVersions } from './map-triple-versions';

export function populateApprovedContentProposal(
  proposals: Schema.proposals.Selectable[],
  timestamp: number,
  blockNumber: number
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
        name: pv.name,
        description: pv.description,
        created_at: timestamp,
        created_at_block: blockNumber,
        updated_at: timestamp,
        updated_at_block: blockNumber,
        created_by_id: pv.created_by_id,
      };

      return newEntity;
    });

    const versions = proposedVersions.map(pv => {
      const newVersion: Schema.versions.Insertable = {
        id: createGeoId(),
        entity_id: pv.entity_id,
        created_at_block: blockNumber,
        created_at: timestamp,
        name: pv.name,
        created_by_id: pv.created_by_id,
        proposed_version_id: pv.id,
        space_id: pv.space_id,
        description: pv.description,
      };

      return newVersion;
    });

    const tripleVersions = yield* awaited(mapTripleVersions(versions));

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          try: () =>
            // We update the name and description for an entity when mapping
            // through triples.
            upsertChunked('geo_entities', entities, 'id', {
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
        Effect.tryPromise({
          try: () => upsertChunked('triple_versions', tripleVersions, ['triple_id', 'version_id']),
          catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
        }),
      ])
    );
  });
}
