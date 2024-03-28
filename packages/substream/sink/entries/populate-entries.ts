import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { upsertChunked } from '../utils/db';
import { type FullEntry } from '../zod';
import {
  mapAccounts,
  mapActions,
  mapEntities,
  mapProposals,
  mapProposedVersions,
  mapSpaces,
  mapTriplesWithActionType,
  mapVersions,
} from './map-entries';
import { mapTripleVersions } from './map-triple-versions';
import { populateTriples } from './populate-triples';

export async function populateWithFullEntries({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}) {
  const populateEffect = Effect.gen(function* (awaited) {
    const accounts = mapAccounts(fullEntries[0]?.author);

    const actions: Schema.actions.Insertable[] = mapActions({
      fullEntries,
      cursor,
      timestamp,
      blockNumber,
    });

    const geoEntities: Schema.geo_entities.Insertable[] = mapEntities({
      fullEntries,
      blockNumber,
      timestamp,
    });

    const proposals: Schema.proposals.Insertable[] = mapProposals({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const proposed_versions: Schema.proposed_versions.Insertable[] = mapProposedVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const spaces: Schema.spaces.Insertable[] = mapSpaces(fullEntries, blockNumber);

    const versions: Schema.versions.Insertable[] = mapVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const existingTripleVersions = yield* awaited(mapTripleVersions(versions));

    // Write all non-version and non-triple data in parallel
    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          try: () =>
            upsertChunked('spaces', spaces, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk spaces. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('accounts', accounts, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk accounts. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('actions', actions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk actions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            // We update the name and description for an entity when mapping
            // through triples.
            upsertChunked('geo_entities', geoEntities, 'id', {
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
            upsertChunked('proposed_versions', proposed_versions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk proposed versions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('versions', versions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk versions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () => upsertChunked('triple_versions', existingTripleVersions, ['triple_id', 'version_id']),
          catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
        }),
      ])
    );

    yield* awaited(
      populateTriples({
        entries: fullEntries.map(e => ({
          space: e.space,
          actions: e.uriData.actions,
        })),
        blockNumber,
        timestamp,
        createdById: fullEntries[0]?.author!,
        versions,
      })
    );
  });

  return await Effect.runPromise(populateEffect);
}
